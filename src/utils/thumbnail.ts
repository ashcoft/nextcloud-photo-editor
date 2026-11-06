/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Render a small PNG thumbnail of a canvas, for the Files grid.
 *
 * The thumbnail is capped at `maxSize` on its longest edge, so a large
 * document does not produce a multi-megabyte upload the server would reject.
 */
export function renderThumbnail(canvas: HTMLCanvasElement, maxSize = 512): string | null {
  if (canvas.width === 0 || canvas.height === 0) {
    return null
  }

  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height))
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))

  const thumb = document.createElement('canvas')
  thumb.width = width
  thumb.height = height

  const context = thumb.getContext('2d')
  if (context === null) {
    return null
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(canvas, 0, 0, width, height)

  try {
    return thumb.toDataURL('image/png')
  } catch {
    return null
  }
}
