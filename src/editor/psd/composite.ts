/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Composite a parsed PSD document to a canvas.
 *
 * Two paths are available, in order of preference:
 *
 *  1. The merged image Photoshop stores in the file. It is the document as
 *     Photoshop itself renders it, including effects this editor does not
 *     model, so it is used whenever it is present.
 *  2. A layer composite: each visible layer is decoded and drawn bottom-to-top
 *     with its blend mode and opacity applied through the canvas compositing
 *     model.
 *
 * Neither path mutates the source document.
 */

import { inflate } from './binary'
import { Compression, decodeChannel, undoPrediction } from './decode'
import {
  ColorMode,
  type PsdDocument,
  type PsdHeader,
  type PsdLayer,
  blendModeName,
} from './types'

/** Blend modes the canvas 2D context implements directly. */
const CANVAS_BLEND_MODES = new Set([
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
])

export interface CompositeOptions {
  /** Render the merged image when the file carries one. Default true. */
  preferMerged?: boolean
  /** Cap the rendered width; the height follows. Default: no cap. */
  maxWidth?: number
}

/**
 * Render a document to a canvas.
 *
 * The returned canvas is always `document.width` x `document.height` unless
 * `maxWidth` is set, in which case it is scaled down proportionally.
 */
export async function compositeDocument(
  document: PsdDocument,
  options: CompositeOptions = {},
): Promise<HTMLCanvasElement> {
  const preferMerged = options.preferMerged !== false

  if (preferMerged && document.imageData.length > 0 && isRenderable(document.header)) {
    const merged = await renderMerged(document)
    if (merged !== null) {
      return scaleCanvas(merged, options.maxWidth)
    }
  }

  const canvas = await renderLayers(document)
  return scaleCanvas(canvas, options.maxWidth)
}

/**
 * Whether the compositor can turn this document's channels into RGB.
 *
 * The layer path treats the first three channels as R, G and B, which is only
 * true for RGB and (via replication) grayscale. CMYK, Lab and indexed
 * documents need a conversion the compositor does not implement, so they are
 * reported as unrenderable rather than drawn with wrong colours.
 */
export function isRenderable(header: PsdHeader): boolean {
  return header.colorMode === ColorMode.RGB || header.colorMode === ColorMode.GRAYSCALE
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Render the merged composite channels into a canvas.
 *
 * Returns null when the channels cannot be turned into RGB.
 */
async function renderMerged(document: PsdDocument): Promise<HTMLCanvasElement | null> {
  const { header } = document
  if (!isRenderable(header)) {
    return null
  }

  const { width, height } = header
  const planes = await decodeCompositePlanes(document)
  if (planes === null) {
    return null
  }

  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  if (context === null) {
    return null
  }

  const image = context.createImageData(width, height)
  const red = planes[0]
  const green = planes[1]
  const blue = planes[2]
  // Grayscale documents have no separate green/blue planes, so a transparency
  // channel sits at index 1 rather than 3.
  const alphaIndex = header.colorMode === ColorMode.GRAYSCALE ? 1 : 3
  const alpha = hasAlphaChannel(document) ? planes[alphaIndex] : undefined

  if (red === undefined) {
    return null
  }

  const isGray = header.colorMode === ColorMode.GRAYSCALE

  for (let i = 0; i < width * height; i += 1) {
    const r = red[i]!
    const g = isGray ? r : (green?.[i] ?? r)
    const b = isGray ? r : (blue?.[i] ?? r)
    const a = alpha === undefined ? 255 : alpha[i]!

    const offset = i * 4
    image.data[offset] = r
    image.data[offset + 1] = g
    image.data[offset + 2] = b
    image.data[offset + 3] = a
  }

  context.putImageData(image, 0, 0)
  return canvas
}

/**
 * Decode every channel of the merged Image Data Section.
 *
 * All channels share one 2-byte compression tag at the start of the section,
 * but the three compression schemes lay the channels out differently:
 *
 *  - Raw: each channel is a fixed-size block, one after another.
 *  - ZIP: one deflate stream holds every channel's samples back to back.
 *  - RLE: a byte count for every row of every channel comes first, and only
 *    then the packed rows, so the counts must be read as one table.
 *
 * @returns One plane per channel in file order, or null when the section
 *   cannot be decoded.
 */
async function decodeCompositePlanes(document: PsdDocument): Promise<Uint8Array[] | null> {
  const section = document.imageData
  if (section.length < 2) {
    return null
  }

  const { width, height, depth, channels, version } = document.header
  const isPsb = version === 2
  const compression = (section[0]! << 8) | section[1]!
  const body = section.subarray(2)
  const bytesPerSample = depth === 1 ? 1 : depth / 8
  const planeSize = width * height

  try {
    if (compression === Compression.RLE) {
      return await decodeCompositeRle(body, width, height, depth, channels, isPsb)
    }

    if (compression === Compression.ZIP || compression === Compression.ZIP_PREDICTION) {
      return await decodeCompositeZip(
        body,
        width,
        height,
        depth,
        channels,
        compression,
        isPsb,
      )
    }

    if (compression !== Compression.RAW) {
      return null
    }

    const planes: Uint8Array[] = []
    let offset = 0

    for (let c = 0; c < channels; c += 1) {
      const length = planeSize * bytesPerSample
      const channelData = concat(
        Uint8Array.from([0, Compression.RAW]),
        body.subarray(offset, Math.min(body.length, offset + length)),
      )
      offset += length
      planes.push(await decodeChannel(channelData, width, height, depth, isPsb))
    }

    return planes
  } catch {
    return null
  }
}

/**
 * Decode a ZIP-compressed merged image.
 *
 * The section holds a single deflate stream containing every channel's samples
 * in order, so it is inflated once and then split; inflating it per channel
 * would fail because each channel after the first has no stream header.
 */
async function decodeCompositeZip(
  body: Uint8Array,
  width: number,
  height: number,
  depth: number,
  channels: number,
  compression: number,
  isPsb: boolean,
): Promise<Uint8Array[]> {
  const bytesPerSample = depth === 1 ? 1 : depth / 8
  const planeSize = width * height * bytesPerSample
  const expected = planeSize * channels

  const inflated = await inflate(body, expected)
  if (inflated === null) {
    throw new Error('Could not inflate the merged image')
  }

  const planes: Uint8Array[] = []

  for (let c = 0; c < channels; c += 1) {
    const start = c * planeSize
    const plane = inflated.subarray(start, Math.min(inflated.length, start + planeSize))

    // Prediction is applied per channel before the planes are concatenated, so
    // each plane is undone on its own.
    const view = Uint8Array.from(plane)
    const samples = compression === Compression.ZIP_PREDICTION
      ? undoPrediction(view, width, height, depth)
      : view

    planes.push(
      await decodeChannel(
        concat(
          Uint8Array.from([(compression >> 8) & 0xff, compression & 0xff]),
          samples,
        ),
        width,
        height,
        depth,
        isPsb,
      ),
    )
  }

  return planes
}

/**
 * Decode an RLE-compressed merged image.
 *
 * Photoshop writes the row-count table for all channels before the packed rows
 * begin, so the counts are read in one pass and the rows are then decoded
 * channel by channel from the position that table ends at.
 */
async function decodeCompositeRle(
  body: Uint8Array,
  width: number,
  height: number,
  depth: number,
  channels: number,
  isPsb: boolean,
): Promise<Uint8Array[]> {
  const countSize = isPsb ? 4 : 2
  const totalRows = channels * height

  if (body.length < totalRows * countSize) {
    throw new Error('RLE row-count table is truncated')
  }

  const counts = new Uint32Array(totalRows)
  let offset = 0
  for (let i = 0; i < totalRows; i += 1) {
    counts[i] = isPsb
      ? ((body[offset]! << 24) | (body[offset + 1]! << 16) | (body[offset + 2]! << 8) | body[offset + 3]!) >>> 0
      : (body[offset]! << 8) | body[offset + 1]!
    offset += countSize
  }

  const planes: Uint8Array[] = []

  for (let c = 0; c < channels; c += 1) {
    let packed = 0
    for (let row = 0; row < height; row += 1) {
      packed += counts[c * height + row]!
    }

    const end = Math.min(body.length, offset + packed)
    const channelData = concat(
      Uint8Array.from([0, Compression.RLE]),
      body.subarray(offset, end),
    )
    offset = end

    planes.push(await decodeChannel(channelData, width, height, depth, isPsb))
  }

  return planes
}

/**
 * Whether the merged image has a trailing transparency channel.
 *
 * The header's channel count covers the colour channels plus, optionally, one
 * alpha channel: RGB has 3 colour channels, grayscale 1, CMYK 4. A count one
 * above the colour-channel count means the last channel is alpha.
 */
function hasAlphaChannel(document: PsdDocument): boolean {
  const { channels, colorMode } = document.header
  switch (colorMode) {
    case ColorMode.GRAYSCALE:
      return channels >= 2
    case ColorMode.RGB:
      return channels >= 4
    case ColorMode.CMYK:
      return channels >= 5
    default:
      return channels >= 4
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/**
 * Composite the layer stack bottom-to-top.
 */
async function renderLayers(document: PsdDocument): Promise<HTMLCanvasElement> {
  const { width, height } = document.header
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  if (context === null) {
    return canvas
  }

  const flat = flattenDrawable(document.layers, true, 1)
  // Photoshop stores the bottom-most layer first; the parsed tree is
  // top-to-bottom, so draw it in reverse.
  for (let i = flat.length - 1; i >= 0; i -= 1) {
    const { layer, opacity } = flat[i]!
    const layerCanvas = await renderLayer(document, layer)
    if (layerCanvas === null) {
      continue
    }

    context.save()
    context.globalAlpha = opacity
    const mode = blendModeName(layer.blendMode)
    context.globalCompositeOperation = CANVAS_BLEND_MODES.has(mode)
      ? (mode as GlobalCompositeOperation)
      : 'source-over'
    context.drawImage(layerCanvas, layer.left, layer.top)
    context.restore()
  }

  return canvas
}

interface FlatLayer {
  layer: PsdLayer
  /** The layer's opacity multiplied by every enclosing group's. */
  opacity: number
}

/**
 * Flatten a layer tree into the draw order, carrying inherited state.
 *
 * A hidden group hides its children, and a group's opacity multiplies into
 * theirs, so both are accumulated on the way down. A child of a hidden group
 * must not be drawn on its own.
 */
function flattenDrawable(layers: PsdLayer[], visible: boolean, opacity: number): FlatLayer[] {
  const out: FlatLayer[] = []

  for (const layer of layers) {
    const layerVisible = visible && layer.visible
    const layerOpacity = opacity * (layer.opacity / 255)

    if (layer.children.length > 0) {
      out.push(...flattenDrawable(layer.children, layerVisible, layerOpacity))
      continue
    }

    if (layerVisible) {
      out.push({ layer, opacity: layerOpacity })
    }
  }

  return out
}

/**
 * Render a single layer to its own canvas, positioned at the origin.
 *
 * The layer's own width and height come from its bounds, not the document, so
 * a small layer does not force a document-sized buffer.
 */
async function renderLayer(
  document: PsdDocument,
  layer: PsdLayer,
): Promise<HTMLCanvasElement | null> {
  const width = layer.right - layer.left
  const height = layer.bottom - layer.top
  if (width <= 0 || height <= 0) {
    return null
  }

  const { depth, colorMode, version } = document.header
  const isPsb = version === 2

  const red = await layerPlane(layer, 0, width, height, depth, isPsb)
  const green = await layerPlane(layer, 1, width, height, depth, isPsb)
  const blue = await layerPlane(layer, 2, width, height, depth, isPsb)
  const alpha = await layerPlane(layer, -1, width, height, depth, isPsb)

  if (red === null) {
    return null
  }

  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  if (context === null) {
    return null
  }

  const image = context.createImageData(width, height)
  const isGray = colorMode === ColorMode.GRAYSCALE

  for (let i = 0; i < width * height; i += 1) {
    const r = red[i]!
    const g = isGray ? r : (green?.[i] ?? r)
    const b = isGray ? r : (blue?.[i] ?? r)
    const a = alpha === null ? 255 : alpha[i]!

    const offset = i * 4
    image.data[offset] = r
    image.data[offset + 1] = g
    image.data[offset + 2] = b
    image.data[offset + 3] = a
  }

  context.putImageData(image, 0, 0)
  return canvas
}

async function layerPlane(
  layer: PsdLayer,
  channelId: number,
  width: number,
  height: number,
  depth: number,
  isPsb: boolean,
): Promise<Uint8Array | null> {
  const data = layer.channelData.get(channelId)
  if (data === undefined || data.length === 0) {
    return null
  }

  try {
    return await decodeChannel(data, width, height, depth, isPsb)
  } catch {
    return null
  }
}

/**
 * Scale a canvas down to a maximum width, preserving the aspect ratio.
 *
 * A no-op when the canvas is already within the cap, so the common case does
 * not copy pixels.
 */
export function scaleCanvas(canvas: HTMLCanvasElement, maxWidth?: number): HTMLCanvasElement {
  if (maxWidth === undefined || maxWidth <= 0 || canvas.width <= maxWidth) {
    return canvas
  }

  const ratio = maxWidth / canvas.width
  const scaled = createCanvas(maxWidth, Math.max(1, Math.round(canvas.height * ratio)))
  const context = scaled.getContext('2d')
  if (context === null) {
    return canvas
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(canvas, 0, 0, scaled.width, scaled.height)
  return scaled
}

/**
 * Flatten a layer tree into a serialisable summary for the layers panel.
 *
 * Only the fields the UI shows are copied, so the panel never holds a
 * reference to the (potentially large) channel buffers.
 */
export interface LayerSummary {
  id: number
  name: string
  depth: number
  isGroup: boolean
  visible: boolean
  opacity: number
  blendMode: string
  width: number
  height: number
}

export function summarizeLayers(layers: PsdLayer[]): LayerSummary[] {
  let nextId = 0
  const out: LayerSummary[] = []

  const walk = (nodes: PsdLayer[], depth: number): void => {
    for (const layer of nodes) {
      out.push({
        id: nextId++,
        name: layer.name,
        depth,
        isGroup: layer.isGroup,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: blendModeName(layer.blendMode),
        width: Math.max(0, layer.right - layer.left),
        height: Math.max(0, layer.bottom - layer.top),
      })
      if (layer.children.length > 0) {
        walk(layer.children, depth + 1)
      }
    }
  }

  walk(layers, 0)
  return out
}

export function headerSummary(header: PsdHeader): string {
  const modes: Record<number, string> = {
    [ColorMode.BITMAP]: 'Bitmap',
    [ColorMode.GRAYSCALE]: 'Grayscale',
    [ColorMode.INDEXED]: 'Indexed',
    [ColorMode.RGB]: 'RGB',
    [ColorMode.CMYK]: 'CMYK',
    [ColorMode.MULTICHANNEL]: 'Multichannel',
    [ColorMode.DUOTONE]: 'Duotone',
    [ColorMode.LAB]: 'Lab',
  }
  const mode = modes[header.colorMode] ?? 'Unknown'
  const version = header.version === 2 ? 'PSB' : 'PSD'
  return `${version} · ${header.width}×${header.height} · ${mode} · ${header.depth}-bit`
}
