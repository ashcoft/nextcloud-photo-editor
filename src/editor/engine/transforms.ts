/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Geometric transforms: crop, rotate, flip and resize.
 *
 * Transforms are recorded as data and applied to a canvas when rendering, so
 * the original pixels are never overwritten and the history can replay them.
 */

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TransformState {
  /** Crop in source pixels, or null for the whole image. */
  crop: CropRect | null
  /** Rotation in degrees, one of 0, 90, 180, 270. */
  rotation: number
  flipHorizontal: boolean
  flipVertical: boolean
  /** Target width in pixels, or null to keep the source width. */
  width: number | null
  /** Target height in pixels, or null to keep the source height. */
  height: number | null
}

export const DEFAULT_TRANSFORM: TransformState = {
  crop: null,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  width: null,
  height: null,
}

export function cloneTransform(transform: TransformState): TransformState {
  return {
    ...transform,
    crop: transform.crop ? { ...transform.crop } : null,
  }
}

export function isIdentityTransform(transform: TransformState): boolean {
  return (
    transform.crop === null &&
    transform.rotation === 0 &&
    !transform.flipHorizontal &&
    !transform.flipVertical &&
    transform.width === null &&
    transform.height === null
  )
}

/**
 * Clamp a crop rectangle to the image bounds.
 *
 * A zero-width or zero-height request is not meaningful, so it is rejected
 * (returns null) rather than being widened to a single pixel; the caller then
 * keeps the whole image.
 */
export function clampCrop(crop: CropRect, width: number, height: number): CropRect | null {
  if (crop.width < 1 || crop.height < 1) {
    return null
  }

  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x)))
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y)))
  const right = Math.max(x + 1, Math.min(width, Math.round(crop.x + crop.width)))
  const bottom = Math.max(y + 1, Math.min(height, Math.round(crop.y + crop.height)))

  const clampedWidth = right - x
  const clampedHeight = bottom - y
  if (clampedWidth < 1 || clampedHeight < 1) {
    return null
  }

  return { x, y, width: clampedWidth, height: clampedHeight }
}

/**
 * Apply a transform to a source canvas, returning a new canvas.
 *
 * Rotation by 90 or 270 swaps the output dimensions; the scale step runs last
 * so a resize never interacts with the rotation's axis swap.
 */
export function applyTransform(
  source: HTMLCanvasElement,
  transform: TransformState,
): HTMLCanvasElement {
  let canvas = source

  if (transform.crop) {
    const crop = clampCrop(transform.crop, canvas.width, canvas.height)
    if (crop) {
      canvas = cropCanvas(canvas, crop)
    }
  }

  if (transform.flipHorizontal || transform.flipVertical) {
    canvas = flipCanvas(canvas, transform.flipHorizontal, transform.flipVertical)
  }

  if (transform.rotation !== 0) {
    canvas = rotateCanvas(canvas, transform.rotation)
  }

  if (transform.width !== null || transform.height !== null) {
    canvas = resizeCanvas(canvas, transform.width, transform.height)
  }

  return canvas
}

export function cropCanvas(source: HTMLCanvasElement, crop: CropRect): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (context !== null) {
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    )
  }
  return canvas
}

export function flipCanvas(
  source: HTMLCanvasElement,
  horizontal: boolean,
  vertical: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (context === null) {
    return canvas
  }

  context.translate(horizontal ? source.width : 0, vertical ? source.height : 0)
  context.scale(horizontal ? -1 : 1, vertical ? -1 : 1)
  context.drawImage(source, 0, 0)
  return canvas
}

/**
 * Rotate a canvas clockwise by 90, 180 or 270 degrees.
 */
export function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const normalized = ((degrees % 360) + 360) % 360
  if (normalized === 0) {
    return source
  }

  const swap = normalized === 90 || normalized === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? source.height : source.width
  canvas.height = swap ? source.width : source.height

  const context = canvas.getContext('2d')
  if (context === null) {
    return canvas
  }

  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((normalized * Math.PI) / 180)
  context.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

/**
 * Largest edge the editor will resize to, in pixels.
 *
 * The resize controls take raw user input, and a canvas is allocated at the
 * requested size immediately, so the value is bounded here rather than left to
 * fail when the browser cannot allocate it.
 */
export const MAX_RESIZE_EDGE = 16384

/**
 * Resize a canvas, preserving the aspect ratio when only one axis is given.
 *
 * The target is clamped to `MAX_RESIZE_EDGE` on each edge, so an accidental
 * extra digit cannot allocate a canvas the browser will refuse.
 */
export function resizeCanvas(
  source: HTMLCanvasElement,
  width: number | null,
  height: number | null,
): HTMLCanvasElement {
  const aspect = source.width / source.height

  let targetWidth = width ?? (height !== null ? Math.round(height * aspect) : source.width)
  let targetHeight = height ?? (width !== null ? Math.round(width / aspect) : source.height)

  targetWidth = clampEdge(targetWidth)
  targetHeight = clampEdge(targetHeight)

  if (targetWidth === source.width && targetHeight === source.height) {
    return source
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (context !== null) {
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, targetWidth, targetHeight)
  }
  return canvas
}

function clampEdge(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(MAX_RESIZE_EDGE, Math.max(1, Math.round(value)))
}
