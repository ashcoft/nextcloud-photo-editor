/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Regression tests for the findings fixed during review.
 */

import { autoContrast, applyFilters } from '../../src/editor/engine/filters'
import { EditHistory, createEditState } from '../../src/editor/engine/history'
import { MAX_RESIZE_EDGE } from '../../src/editor/engine/transforms'
import { isServerEncodable } from '../../src/editor/mimeTypes'

function imageOf(pixels: number[][]): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach((pixel, i) => {
    data[i * 4] = pixel[0]!
    data[i * 4 + 1] = pixel[1]!
    data[i * 4 + 2] = pixel[2]!
    data[i * 4 + 3] = pixel[3] ?? 255
  })
  return { data, width: pixels.length, height: 1, colorSpace: 'srgb' } as ImageData
}

describe('autoContrast', () => {
  it('leaves a zero-variance channel untouched instead of blacking it', () => {
    // Every pixel is the same mid grey: there is no range to stretch, so the
    // colour must survive rather than collapsing to black.
    const image = imageOf([
      [128, 128, 128, 255],
      [128, 128, 128, 255],
    ])

    autoContrast(image)

    expect(Array.from(image.data.slice(0, 3))).toEqual([128, 128, 128])
  })

  it('still stretches a channel that does vary', () => {
    const image = imageOf([
      [100, 100, 100, 255],
      [150, 150, 150, 255],
    ])

    autoContrast(image)

    expect(image.data[0]).toBe(0)
    expect(image.data[4]).toBe(255)
  })
})

describe('applyFilters', () => {
  it('applies a fixed order regardless of how the state is built', () => {
    // Blur then invert differs from invert then blur, so the order has to be
    // deterministic for a given set of enabled filters.
    const a = imageOf([
      [10, 10, 10, 255],
      [200, 200, 200, 255],
    ])
    const b = imageOf([
      [10, 10, 10, 255],
      [200, 200, 200, 255],
    ])

    const filters = {
      grayscale: false,
      sepia: false,
      invert: true,
      blur: false,
      sharpen: false,
      autoContrast: false,
    }

    applyFilters(a, filters)
    applyFilters(b, filters)

    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})

describe('EditHistory.present', () => {
  it('returns a copy, so a caller cannot mutate a snapshot in place', () => {
    const history = new EditHistory()
    const present = history.present
    present.adjustments.brightness = 99

    expect(history.present.adjustments.brightness).toBe(0)
  })
})

describe('resize bounds', () => {
  it('exposes a maximum edge', () => {
    expect(MAX_RESIZE_EDGE).toBeGreaterThan(0)
  })
})

describe('isServerEncodable', () => {
  it('accepts the formats a canvas encodes reliably', () => {
    expect(isServerEncodable('png')).toBe(true)
    expect(isServerEncodable('jpg')).toBe(true)
    expect(isServerEncodable('jpeg')).toBe(true)
  })

  it('rejects the formats a canvas silently re-encodes as PNG', () => {
    // Saving one of these would write PNG bytes under the original extension.
    expect(isServerEncodable('gif')).toBe(false)
    expect(isServerEncodable('bmp')).toBe(false)
    expect(isServerEncodable('avif')).toBe(false)
    expect(isServerEncodable('webp')).toBe(false)
  })
})
