/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import {
  extensionOf,
  isPsdExtension,
  isPsdMime,
  isRasterExtension,
  isRasterMime,
  isSupportedExtension,
  isSupportedMime,
  mimeForExtension,
} from '../../src/editor/mimeTypes'

describe('mimeTypes', () => {
  it('recognises PSD mime types', () => {
    expect(isPsdMime('image/vnd.adobe.photoshop')).toBe(true)
    expect(isPsdMime('image/x-photoshop')).toBe(true)
    expect(isPsdMime('image/png')).toBe(false)
  })

  it('recognises raster mime types', () => {
    expect(isRasterMime('image/png')).toBe(true)
    expect(isRasterMime('image/jpeg')).toBe(true)
    expect(isRasterMime('image/vnd.adobe.photoshop')).toBe(false)
  })

  it('accepts both families as supported', () => {
    expect(isSupportedMime('image/png')).toBe(true)
    expect(isSupportedMime('image/vnd.adobe.photoshop-large')).toBe(true)
    expect(isSupportedMime('application/pdf')).toBe(false)
  })

  it('extracts a lower-case extension', () => {
    expect(extensionOf('Photo.PSD')).toBe('psd')
    expect(extensionOf('no-extension')).toBe('')
  })

  it('recognises extensions', () => {
    expect(isPsdExtension('a.psb')).toBe(true)
    expect(isRasterExtension('a.jpeg')).toBe(true)
    expect(isSupportedExtension('a.psd')).toBe(true)
    expect(isSupportedExtension('a.txt')).toBe(false)
  })

  it('maps extensions to mime types', () => {
    expect(mimeForExtension('jpg')).toBe('image/jpeg')
    expect(mimeForExtension('JPEG')).toBe('image/jpeg')
    expect(mimeForExtension('webp')).toBe('image/webp')
    expect(mimeForExtension('png')).toBe('image/png')
    expect(mimeForExtension('unknown')).toBe('image/png')
  })
})
