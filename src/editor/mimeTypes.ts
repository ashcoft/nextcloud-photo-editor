/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * MIME types and extensions the editor can open.
 *
 * The Photoshop aliases are listed so a file is recognised even before
 * Nextcloud has resolved it to the canonical type.
 */
export const CANONICAL_PSD_MIME = 'image/vnd.adobe.photoshop'
export const CANONICAL_PSB_MIME = 'image/vnd.adobe.photoshop-large'

export const PSD_MIMES = [
  CANONICAL_PSD_MIME,
  CANONICAL_PSB_MIME,
  'image/x-photoshop',
  'image/photoshop',
  'image/psd',
  'image/x-psd',
  'application/x-photoshop',
  'image/psb',
  'image/x-psb',
] as const

/** Raster formats the editor can open and write back. */
export const RASTER_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
] as const

export const RASTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
export const PSD_EXTENSIONS = ['psd', 'psb']

const SUPPORTED_MIMES: readonly string[] = [...PSD_MIMES, ...RASTER_MIMES]

export function isPsdMime(mime: string): boolean {
  return (PSD_MIMES as readonly string[]).includes(mime)
}

export function isRasterMime(mime: string): boolean {
  return (RASTER_MIMES as readonly string[]).includes(mime)
}

export function isSupportedMime(mime: string): boolean {
  return SUPPORTED_MIMES.includes(mime)
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Whether a file name is a Photoshop document.
 */
export function isPsdExtension(name: string): boolean {
  return PSD_EXTENSIONS.includes(extensionOf(name))
}

/**
 * Whether a file name is a raster format the editor can write back.
 */
export function isRasterExtension(name: string): boolean {
  return RASTER_EXTENSIONS.includes(extensionOf(name))
}

/**
 * Whether a file name is one the editor can open.
 */
export function isSupportedExtension(name: string): boolean {
  return isPsdExtension(name) || isRasterExtension(name)
}

/**
 * The MIME type to write an export with, from a file extension.
 */
export function mimeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'psd':
      return CANONICAL_PSD_MIME
    case 'psb':
      return CANONICAL_PSB_MIME
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}
