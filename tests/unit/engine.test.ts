/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import {
  DEFAULT_ADJUSTMENTS,
  applyAdjustments,
  hslToRgb,
  isNeutral,
  rgbToHsl,
  shiftHue,
} from '../../src/editor/engine/adjustments'
import {
  autoContrast,
  grayscale,
  hasActiveFilter,
  invert,
  sepia,
} from '../../src/editor/engine/filters'
import {
  clampCrop,
  isIdentityTransform,
  DEFAULT_TRANSFORM,
} from '../../src/editor/engine/transforms'

/** Build a 2x2 ImageData from four RGBA tuples. */
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

describe('adjustments', () => {
  it('treats the defaults as neutral', () => {
    expect(isNeutral(DEFAULT_ADJUSTMENTS)).toBe(true)
  })

  it('leaves pixels untouched when neutral', () => {
    const image = imageOf([[10, 20, 30, 255]])
    applyAdjustments(image, DEFAULT_ADJUSTMENTS)
    expect(Array.from(image.data)).toEqual([10, 20, 30, 255])
  })

  it('brightens every channel', () => {
    const image = imageOf([[100, 100, 100, 255]])
    applyAdjustments(image, { ...DEFAULT_ADJUSTMENTS, brightness: 50 })
    expect(image.data[0]).toBeGreaterThan(100)
    expect(image.data[0]).toBe(image.data[1])
    expect(image.data[1]).toBe(image.data[2])
  })

  it('does not change alpha', () => {
    const image = imageOf([[100, 100, 100, 128]])
    applyAdjustments(image, { ...DEFAULT_ADJUSTMENTS, brightness: 50, contrast: 20 })
    expect(image.data[3]).toBe(128)
  })

  it('desaturates to the expected luma', () => {
    const image = imageOf([[200, 50, 25, 255]])
    applyAdjustments(image, { ...DEFAULT_ADJUSTMENTS, saturation: -100 })

    // 0.299*200 + 0.587*50 + 0.114*25 = 91.8 -> 92. Asserting the value, not
    // just that the channels agree, so an implementation that wrote black
    // pixels would fail.
    const expected = Math.round(0.299 * 200 + 0.587 * 50 + 0.114 * 25)
    expect(image.data[0]).toBe(expected)
    expect(image.data[1]).toBe(expected)
    expect(image.data[2]).toBe(expected)
  })

  it('warms the image by raising red and lowering blue', () => {
    const image = imageOf([[100, 100, 100, 255]])
    applyAdjustments(image, { ...DEFAULT_ADJUSTMENTS, temperature: 50 })
    expect(image.data[0]).toBeGreaterThan(100)
    expect(image.data[2]).toBeLessThan(100)
  })

  it('rotates hue without changing saturation and lightness', () => {
    const [r, g, b] = [255, 0, 0]
    const [nr, ng, nb] = shiftHue(r, g, b, 120)
    // Red rotated 120 degrees is green.
    expect(nr).toBeLessThan(10)
    expect(ng).toBeGreaterThan(245)
    expect(nb).toBeLessThan(10)
  })

  it('round-trips RGB through HSL', () => {
    const [h, s, l] = rgbToHsl(0.2, 0.6, 0.9)
    const [r, g, b] = hslToRgb(h, s, l)
    expect(Math.round(r * 255)).toBeCloseTo(51, 0)
    expect(Math.round(g * 255)).toBeCloseTo(153, 0)
    expect(Math.round(b * 255)).toBeCloseTo(230, -1)
  })
})

describe('filters', () => {
  it('reports no active filter by default', () => {
    expect(hasActiveFilter({
      grayscale: false,
      sepia: false,
      invert: false,
      blur: false,
      sharpen: false,
      autoContrast: false,
    })).toBe(false)
  })

  it('converts to grayscale', () => {
    const image = imageOf([[255, 0, 0, 255]])
    grayscale(image)
    expect(image.data[0]).toBe(image.data[1])
    expect(image.data[1]).toBe(image.data[2])
  })

  it('inverts colours', () => {
    const image = imageOf([[0, 128, 255, 255]])
    invert(image)
    expect(Array.from(image.data.slice(0, 3))).toEqual([255, 127, 0])
  })

  it('applies a sepia tone', () => {
    const image = imageOf([[100, 100, 100, 255]])
    sepia(image)
    expect(image.data[0]).toBeGreaterThan(image.data[2]!)
  })

  it('stretches contrast to the full range', () => {
    const image = imageOf([[100, 100, 100, 255], [150, 150, 150, 255]])
    autoContrast(image)
    expect(image.data[0]).toBe(0)
    expect(image.data[4]).toBe(255)
  })
})

describe('transforms', () => {
  it('reports the default transform as identity', () => {
    expect(isIdentityTransform(DEFAULT_TRANSFORM)).toBe(true)
  })

  it('clamps a crop to the image bounds', () => {
    const crop = clampCrop({ x: -10, y: -10, width: 500, height: 500 }, 100, 50)
    expect(crop).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  it('rejects a crop with no area', () => {
    expect(clampCrop({ x: 10, y: 10, width: 0, height: 0 }, 100, 100)).toBeNull()
  })

  it('clamps a crop that starts past the edge', () => {
    const crop = clampCrop({ x: 200, y: 200, width: 50, height: 50 }, 100, 100)
    expect(crop).toEqual({ x: 99, y: 99, width: 1, height: 1 })
  })
})
