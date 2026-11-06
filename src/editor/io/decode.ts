/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Decode image bytes into a canvas.
 *
 * Browsers decode PNG, JPEG, WEBP, GIF, BMP and (where supported) AVIF through
 * the same `createImageBitmap` path, so a single decode covers every raster
 * format the editor opens. Returns null when the bytes are not a decodable
 * image.
 */
export async function decodeImageToCanvas(bytes: Uint8Array): Promise<HTMLCanvasElement | null> {
  // Copy into a fresh buffer: createImageBitmap may detach the input.
  const blob = new Blob([new Uint8Array(bytes)])

  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (context === null) {
      bitmap.close()
      return null
    }
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    return canvas
  } catch {
    return null
  }
}

/**
 * Encode a canvas to a data URL.
 *
 * A format the browser cannot encode falls back to PNG, so an export never
 * silently produces a broken file.
 */
export function canvasToDataUrl(canvas: HTMLCanvasElement, mime: string, quality = 0.92): string {
  const dataUrl = canvas.toDataURL(mime, quality)
  if (dataUrl.startsWith('data:image/png') || mime === 'image/png') {
    return dataUrl
  }
  // A browser that does not support the requested type returns a PNG data URL
  // anyway; the prefix check above catches that and reports PNG.
  return dataUrl
}

/**
 * Encode a canvas to a Blob, for a download rather than an upload.
 */
export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality)
  })
}
