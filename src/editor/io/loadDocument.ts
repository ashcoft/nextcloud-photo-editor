/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Turn downloaded file bytes into a canvas the editor can work on.
 *
 * PSD/PSB files go through the bundled reader and compositor; every raster
 * format goes through the browser's own decoder. Both paths return the same
 * shape, so the UI does not branch on the format.
 */

import {
  compositeDocument,
  headerSummary,
  isRenderable,
  parsePsd,
  summarizeLayers,
  type LayerSummary,
} from '../psd'
import { decodeImageToCanvas } from './decode'

export interface LoadedDocument {
  /** The base image, before any edit. */
  canvas: HTMLCanvasElement
  /** Human-readable description of the source, shown in the info panel. */
  description: string
  /** PSD layers, for the layers panel. Empty for raster images. */
  layers: LayerSummary[]
  /** Whether the source was a Photoshop document. */
  isPsd: boolean
}

export class DocumentLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentLoadError'
  }
}

/**
 * Build a document from file bytes.
 *
 * `name` selects the path: a PSD/PSB extension uses the bundled reader, and
 * anything else is decoded as a raster image.
 */
export async function loadDocument(bytes: Uint8Array, name: string): Promise<LoadedDocument> {
  if (isPsdName(name)) {
    return loadPsd(bytes)
  }

  const canvas = await decodeImageToCanvas(bytes)
  if (canvas === null) {
    throw new DocumentLoadError('Could not decode this image.')
  }

  return {
    canvas,
    description: `${canvas.width}×${canvas.height}`,
    layers: [],
    isPsd: false,
  }
}

function isPsdName(name: string): boolean {
  return /\.(psd|psb)$/i.test(name)
}

async function loadPsd(bytes: Uint8Array): Promise<LoadedDocument> {
  let document
  try {
    document = parsePsd(bytes)
  } catch (error) {
    throw new DocumentLoadError(
      `Could not read this Photoshop file: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }

  // The compositor only converts RGB and grayscale channels. Drawing a CMYK or
  // Lab document with the layer path would treat its channels as RGB and show
  // the wrong colours, so those are refused instead.
  if (!isRenderable(document.header)) {
    throw new DocumentLoadError(
      'This Photoshop file uses a colour mode the editor cannot display yet (CMYK or Lab).',
    )
  }

  const canvas = await compositeDocument(document)
  if (canvas.width === 0 || canvas.height === 0) {
    throw new DocumentLoadError('This Photoshop file has no drawable content.')
  }

  return {
    canvas,
    description: headerSummary(document.header),
    layers: summarizeLayers(document.layers),
    isPsd: true,
  }
}
