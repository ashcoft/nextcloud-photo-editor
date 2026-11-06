/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Non-destructive colour adjustments applied to the whole image.
 *
 * All values are neutral at their default, so a freshly loaded image renders
 * unchanged. The ranges are chosen to match the sliders in the UI.
 */
export interface Adjustments {
  /** -100..100, 0 neutral. */
  brightness: number
  /** -100..100, 0 neutral. */
  contrast: number
  /** -100..100, 0 neutral. */
  saturation: number
  /** -100..100, 0 neutral. */
  exposure: number
  /** -100..100 (cool..warm), 0 neutral. */
  temperature: number
  /** -180..180 degrees, 0 neutral. */
  hue: number
  /** 0.1..3, 1 neutral. */
  gamma: number
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  hue: 0,
  gamma: 1,
}

export const ADJUSTMENT_RANGES = {
  brightness: { min: -100, max: 100, step: 1 },
  contrast: { min: -100, max: 100, step: 1 },
  saturation: { min: -100, max: 100, step: 1 },
  exposure: { min: -100, max: 100, step: 1 },
  temperature: { min: -100, max: 100, step: 1 },
  hue: { min: -180, max: 180, step: 1 },
  gamma: { min: 0.1, max: 3, step: 0.05 },
} as const

export type AdjustmentKey = keyof Adjustments

/**
 * Whether the adjustments would leave the pixels untouched.
 *
 * The renderer checks this so an untouched image skips the per-pixel pass.
 */
export function isNeutral(adjustments: Adjustments): boolean {
  return (
    adjustments.brightness === 0 &&
    adjustments.contrast === 0 &&
    adjustments.saturation === 0 &&
    adjustments.exposure === 0 &&
    adjustments.temperature === 0 &&
    adjustments.hue === 0 &&
    adjustments.gamma === 1
  )
}

export function cloneAdjustments(adjustments: Adjustments): Adjustments {
  return { ...adjustments }
}

/**
 * Apply the adjustments to an ImageData in place.
 *
 * A per-channel lookup table carries brightness, contrast, exposure and gamma,
 * which are pure per-channel curves; saturation, temperature and hue need the
 * three channels together and are applied afterwards.
 */
export function applyAdjustments(image: ImageData, adjustments: Adjustments): void {
  if (isNeutral(adjustments)) {
    return
  }

  const lut = buildToneCurve(adjustments)
  const data = image.data

  if (adjustments.saturation !== 0 || adjustments.temperature !== 0 || adjustments.hue !== 0) {
    applyColorAdjustments(data, adjustments, lut)
    return
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]!]!
    data[i + 1] = lut[data[i + 1]!]!
    data[i + 2] = lut[data[i + 2]!]!
  }
}

/**
 * Build a 256-entry curve from the per-channel adjustments.
 */
function buildToneCurve(adjustments: Adjustments): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)

  // Exposure is a gain in stops: -100..100 maps to -2..+2 stops.
  const gain = Math.pow(2, adjustments.exposure / 50)

  // Contrast pivots around mid-grey. -100..100 maps to a factor of 0..2.
  const contrast = (adjustments.contrast + 100) / 100
  const contrastFactor = contrast * contrast

  const gamma = adjustments.gamma > 0 ? adjustments.gamma : 1
  const invGamma = 1 / gamma

  const brightness = (adjustments.brightness / 100) * 255

  for (let i = 0; i < 256; i += 1) {
    let value = i / 255

    value *= gain
    value = (value - 0.5) * contrastFactor + 0.5
    value = Math.max(0, Math.min(1, value))
    value = Math.pow(value, invGamma)
    value = value * 255 + brightness

    lut[i] = Math.max(0, Math.min(255, Math.round(value)))
  }

  return lut
}

/**
 * Apply the adjustments that need all three channels.
 *
 * Saturation and hue run in HSL space; temperature is a simple warm/cool shift
 * on the red and blue channels.
 */
function applyColorAdjustments(
  data: Uint8ClampedArray,
  adjustments: Adjustments,
  lut: Uint8ClampedArray,
): void {
  const saturation = 1 + adjustments.saturation / 100
  const warm = adjustments.temperature / 100
  const hueShift = adjustments.hue

  for (let i = 0; i < data.length; i += 4) {
    let r = lut[data[i]!]!
    let g = lut[data[i + 1]!]!
    let b = lut[data[i + 2]!]!

    if (warm !== 0) {
      r = clamp255(r + warm * 30)
      b = clamp255(b - warm * 30)
    }

    if (hueShift !== 0) {
      const shifted = shiftHue(r, g, b, hueShift)
      r = shifted[0]
      g = shifted[1]
      b = shifted[2]
    }

    if (saturation !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b
      r = clamp255(gray + (r - gray) * saturation)
      g = clamp255(gray + (g - gray) * saturation)
      b = clamp255(gray + (b - gray) * saturation)
    }

    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value
}

/**
 * Rotate the hue of one RGB pixel by `degrees`, keeping saturation and
 * lightness.
 */
export function shiftHue(r: number, g: number, b: number, degrees: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255)
  const rotated = (((h * 360 + degrees) % 360) + 360) % 360
  const [nr, ng, nb] = hslToRgb(rotated / 360, s, l)
  return [Math.round(nr * 255), Math.round(ng * 255), Math.round(nb * 255)]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min

  if (delta === 0) {
    return [0, 0, l]
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h: number

  if (max === r) {
    h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
  } else if (max === g) {
    h = ((b - r) / delta + 2) / 6
  } else {
    h = ((r - g) / delta + 4) / 6
  }

  return [h, s, l]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    return [l, l, l]
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t
  if (value < 0) value += 1
  if (value > 1) value -= 1
  if (value < 1 / 6) return p + (q - p) * 6 * value
  if (value < 1 / 2) return q
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
  return p
}
