/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { applyAdjustments, isNeutral } from './adjustments'
import { applyFilters, hasActiveFilter } from './filters'
import { applyTransform, isIdentityTransform } from './transforms'
import type { EditState } from './history'

export interface RenderResult {
  canvas: HTMLCanvasElement
  /** Whether any edit was actually applied. */
  modified: boolean
}

/**
 * Render an edit state onto a copy of the source canvas.
 *
 * Order matters: the geometric transform runs first, so adjustments and
 * filters operate on the final pixel grid and a resize does not change the
 * result of a per-pixel operation. The source canvas is never modified, so the
 * caller can render repeatedly (for example while dragging a slider).
 */
export function renderEdit(source: HTMLCanvasElement, state: EditState): RenderResult {
  const needsPixels = !isNeutral(state.adjustments) || hasActiveFilter(state.filters)

  // A transform is free to hand back the canvas it was given — a resize whose
  // target size already matches, or a crop that covers the whole image. Since
  // the pixel pass below writes in place, the result is copied before it is
  // written to, or the edit would land in the caller's source and every later
  // undo would restore already-modified pixels.
  const transformed = isIdentityTransform(state.transform)
    ? copyCanvas(source)
    : ensureOwned(applyTransform(source, state.transform), source)

  if (!needsPixels) {
    return { canvas: transformed, modified: !isIdentityTransform(state.transform) }
  }

  const context = transformed.getContext('2d')
  if (context === null) {
    return { canvas: transformed, modified: false }
  }

  const image = context.getImageData(0, 0, transformed.width, transformed.height)

  if (!isNeutral(state.adjustments)) {
    applyAdjustments(image, state.adjustments)
  }
  if (hasActiveFilter(state.filters)) {
    applyFilters(image, state.filters)
  }

  context.putImageData(image, 0, 0)
  return { canvas: transformed, modified: true }
}

/**
 * Return a canvas that is safe to write to.
 *
 * The transforms may return their input unchanged; this copies in that case so
 * the caller never receives the source it passed in.
 */
function ensureOwned(canvas: HTMLCanvasElement, source: HTMLCanvasElement): HTMLCanvasElement {
  return canvas === source ? copyCanvas(source) : canvas
}

/**
 * Copy a canvas so the renderer can write to it without touching the source.
 */
export function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (context !== null) {
    context.drawImage(source, 0, 0)
  }
  return canvas
}
