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

import { Compression, decodeChannel } from './decode'
import {
  ColorMode,
  type PsdDocument,
  type PsdHeader,
  type PsdLayer,
  blendModeName,
  isDrawable,
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

  if (preferMerged && document.imageData.length > 0) {
    const merged = await renderMerged(document)
    if (merged !== null) {
      return scaleCanvas(merged, options.maxWidth)
    }
  }

  const canvas = await renderLayers(document)
  return scaleCanvas(canvas, options.maxWidth)
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
 * Returns null when the channels cannot be turned into RGB (an unsupported
 * colour mode, or channels the reader did not capture).
 */
async function renderMerged(document: PsdDocument): Promise<HTMLCanvasElement | null> {
  const { header } = document
  if (header.colorMode !== ColorMode.RGB && header.colorMode !== ColorMode.GRAYSCALE) {
    return null
  }

  const { width, height } = header
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  if (context === null) {
    return null
  }

  const image = context.createImageData(width, height)
  const red = await readPlane(document, 0, width, height)
  const green = await readPlane(document, 1, width, height)
  const blue = await readPlane(document, 2, width, height)
  // Only ask for alpha when the header says the merged image carries one;
  // otherwise the last channel is the blue plane, not transparency.
  const alpha = hasAlphaChannel(document)
    ? await readPlane(document, -1, width, height)
    : null

  if (red === null) {
    return null
  }

  for (let i = 0; i < width * height; i += 1) {
    const r = red[i]!
    const g = header.colorMode === ColorMode.GRAYSCALE ? r : (green?.[i] ?? r)
    const b = header.colorMode === ColorMode.GRAYSCALE ? r : (blue?.[i] ?? r)
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

/**
 * Decode one channel of the merged Image Data Section.
 *
 * Every channel in that section shares a single 2-byte compression tag at the
 * start, followed by the channel data in order. The reader walks the channels
 * to locate the requested one; only that channel is fully decoded.
 */
async function readPlane(
  document: PsdDocument,
  channelId: number,
  width: number,
  height: number,
): Promise<Uint8Array | null> {
  const section = document.imageData
  if (section.length < 2) {
    return null
  }

  const compression = (section[0]! << 8) | section[1]!
  const body = section.subarray(2)

  const totalChannels = document.header.channels
  const wanted = channelId === -1 ? totalChannels - 1 : channelId
  if (wanted < 0 || wanted >= totalChannels) {
    return null
  }

  // The decoder needs a per-channel view. For raw and RLE the channel length is
  // derivable, so the body can be split without decoding the other channels.
  const channelViews = splitCompositeChannels(
    body,
    compression,
    width,
    height,
    totalChannels,
    document.header.depth,
    document.header.version === 2,
  )
  const view = channelViews[wanted]
  if (view === undefined || view.length === 0) {
    return null
  }

  try {
    return await decodeChannel(view, width, height, document.header.depth, document.header.version === 2)
  } catch {
    return null
  }
}

/**
 * Split the merged Image Data Section into per-channel byte ranges.
 *
 * Each returned range includes its own 2-byte compression tag, which is what
 * `decodeChannel` expects. Raw and RLE channels have a computable length; a
 * ZIP-compressed section cannot be split without inflating it, so only the
 * first channel (whose length is the remainder) is returned in that case.
 */
function splitCompositeChannels(
  body: Uint8Array,
  compression: number,
  width: number,
  height: number,
  channels: number,
  depth: number,
  isPsb: boolean,
): Uint8Array[] {
  const tag = (value: number): Uint8Array => Uint8Array.from([(value >> 8) & 0xff, value & 0xff])

  if (compression === Compression.ZIP || compression === Compression.ZIP_PREDICTION) {
    // Not splittable without inflating; the layer path is used instead.
    return []
  }

  const bytesPerSample = depth === 1 ? 1 : depth / 8
  const views: Uint8Array[] = []
  let offset = 0

  for (let c = 0; c < channels; c += 1) {
    if (compression === Compression.RAW) {
      const length = width * height * bytesPerSample
      const end = Math.min(body.length, offset + length)
      views.push(concat(tag(compression), body.subarray(offset, end)))
      offset = end
      continue
    }

    // RLE: a run of per-row byte counts precedes the packed rows.
    const rowCountSize = isPsb ? 4 : 2
    let cursor = offset
    let packed = 0
    for (let row = 0; row < height && cursor + rowCountSize <= body.length; row += 1) {
      const count = isPsb
        ? (body[cursor]! << 24) | (body[cursor + 1]! << 16) | (body[cursor + 2]! << 8) | body[cursor + 3]!
        : (body[cursor]! << 8) | body[cursor + 1]!
      packed += count
      cursor += rowCountSize
    }

    const end = Math.min(body.length, cursor + packed)
    views.push(concat(tag(compression), body.subarray(offset, end)))
    offset = end
  }

  return views
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

  const flat = flatten(document.layers)
  // Photoshop stores the bottom-most layer first; the parsed tree is
  // top-to-bottom, so draw it in reverse.
  for (let i = flat.length - 1; i >= 0; i -= 1) {
    const layer = flat[i]!
    if (!isDrawable(layer)) {
      continue
    }

    const layerCanvas = await renderLayer(document, layer)
    if (layerCanvas === null) {
      continue
    }

    context.save()
    context.globalAlpha = layer.opacity / 255
    const mode = blendModeName(layer.blendMode)
    context.globalCompositeOperation = CANVAS_BLEND_MODES.has(mode)
      ? (mode as GlobalCompositeOperation)
      : 'source-over'
    context.drawImage(layerCanvas, layer.left, layer.top)
    context.restore()
  }

  return canvas
}

function flatten(layers: PsdLayer[]): PsdLayer[] {
  const out: PsdLayer[] = []
  for (const layer of layers) {
    if (layer.children.length > 0) {
      out.push(...flatten(layer.children))
    } else {
      out.push(layer)
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
