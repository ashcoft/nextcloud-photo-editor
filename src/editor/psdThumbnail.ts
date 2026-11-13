/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Render Photoshop bytes into an image the host can use.
 *
 * Two jobs share this module:
 *
 *  - A Files-grid preview thumbnail, which is small and cached server-side.
 *  - A save-back: PhotoCraft's Save always emits a Photoshop document, even
 *    for a raster file that was opened, so a PNG or JPEG target is re-encoded
 *    from those bytes before it is written back. Without this the editor's own
 *    download runs and the file lands in the user's Downloads folder instead
 *    of the Nextcloud folder it came from.
 *
 * The embedded editor draws through WebGPU/WebGL, so its canvas cannot be read
 * back as a 2D bitmap and no screenshot of it can be turned into an image. The
 * app's own PSD reader is kept for exactly this job: it composites the
 * document off-screen and returns an image the server can store.
 */

import { compositeDocument, isRenderable, parsePsd } from './psd'
import { renderThumbnail } from '../utils/thumbnail'

/** Longest edge of the generated thumbnail, in pixels. */
const MAX_EDGE = 512

/**
 * Longest edge the server accepts for a saved raster, in pixels.
 *
 * Mirrors `FileController::MAX_IMAGE_EDGE`; a document larger than this cannot
 * be stored, so it is reported as unconvertible rather than posted and refused.
 */
const MAX_SAVE_EDGE = 16384

/** Most pixels the server accepts for a saved raster. Mirrors `MAX_IMAGE_PIXELS`. */
const MAX_SAVE_PIXELS = 16 * 1024 * 1024

/**
 * Build a PNG data URL preview for a Photoshop document.
 *
 * Returns null when the bytes are not a document this can render, or when the
 * document uses a colour mode the compositor cannot convert (CMYK or Lab).
 * Callers treat null as "no thumbnail" rather than an error: a missing preview
 * is a cosmetic problem, and the Files grid keeps its generic icon.
 */
export async function renderPsdThumbnail(bytes: Uint8Array): Promise<string | null> {
  const canvas = await renderDocument(bytes, MAX_EDGE)
  if (canvas === null) {
    return null
  }

  return renderThumbnail(canvas, MAX_EDGE)
}

/**
 * Re-encode a Photoshop document as a flat image in the given MIME type.
 *
 * Used to write a save back to a raster file. Returns null when the document
 * cannot be rendered, is larger than the server accepts, or the canvas cannot
 * encode the requested type; the caller then falls back to a download.
 */
export async function renderPsdToDataUrl(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string | null> {
  const canvas = await renderDocument(bytes)
  if (canvas === null) {
    return null
  }

  if (canvas.width > MAX_SAVE_EDGE || canvas.height > MAX_SAVE_EDGE) {
    return null
  }
  if (canvas.width * canvas.height > MAX_SAVE_PIXELS) {
    return null
  }

  try {
    // JPEG has no alpha channel, so a transparent document would otherwise
    // encode its transparent pixels as black.
    if (mimeType === 'image/jpeg') {
      return flattenOntoWhite(canvas).toDataURL(mimeType)
    }

    return canvas.toDataURL(mimeType)
  } catch {
    return null
  }
}

/**
 * Composite a document to a canvas, optionally capped on its longest edge.
 *
 * Returns null when the bytes are not a renderable document.
 */
async function renderDocument(
  bytes: Uint8Array,
  maxWidth?: number,
): Promise<HTMLCanvasElement | null> {
  let document
  try {
    document = parsePsd(bytes)
  } catch {
    return null
  }

  if (!isRenderable(document.header)) {
    return null
  }

  let canvas: HTMLCanvasElement
  try {
    canvas = await compositeDocument(document, maxWidth === undefined ? {} : { maxWidth })
  } catch {
    return null
  }

  if (canvas.width === 0 || canvas.height === 0) {
    return null
  }

  return canvas
}

/**
 * Draw a canvas over an opaque white background.
 */
function flattenOntoWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height

  const context = flat.getContext('2d')
  if (context === null) {
    return canvas
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, flat.width, flat.height)
  context.drawImage(canvas, 0, 0)

  return flat
}
