/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Render a preview thumbnail from Photoshop bytes.
 *
 * The embedded editor draws through WebGPU/WebGL, so its canvas cannot be read
 * back as a 2D bitmap and no screenshot of it can be turned into a thumbnail.
 * The app's own PSD reader is kept for exactly this job: it composites the
 * document off-screen and returns a PNG the server can cache, which is what
 * the Files grid needs for a file Nextcloud has no previewer for.
 *
 * This is the only remaining use of the reader. Editing is PhotoCraft's, so
 * nothing here should grow into a second editor.
 */

import { compositeDocument, isRenderable, parsePsd } from './psd'
import { renderThumbnail } from '../utils/thumbnail'

/** Longest edge of the generated thumbnail, in pixels. */
const MAX_EDGE = 512

/**
 * Build a PNG data URL preview for a Photoshop document.
 *
 * Returns null when the bytes are not a document this can render, or when the
 * document uses a colour mode the compositor cannot convert (CMYK or Lab).
 * Callers treat null as "no thumbnail" rather than an error: a missing preview
 * is a cosmetic problem, and the Files grid keeps its generic icon.
 */
export async function renderPsdThumbnail(bytes: Uint8Array): Promise<string | null> {
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
    canvas = await compositeDocument(document, { maxWidth: MAX_EDGE })
  } catch {
    return null
  }

  if (canvas.width === 0 || canvas.height === 0) {
    return null
  }

  return renderThumbnail(canvas, MAX_EDGE)
}
