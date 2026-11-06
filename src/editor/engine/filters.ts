/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Whole-image filters applied after the colour adjustments.
 *
 * Each filter is a small, self-contained pixel operation. They are applied in
 * a fixed order — auto contrast, blur, sharpen, then the per-pixel colour
 * filters — so a given set of enabled filters always renders the same result.
 * A user-chosen order would have to be stored in the edit state; it is not,
 * so the order is deliberately fixed rather than implied.
 */
export const FILTERS = [
  'grayscale',
  'sepia',
  'invert',
  'blur',
  'sharpen',
  'autoContrast',
] as const

export type FilterName = (typeof FILTERS)[number]

export interface FilterState {
  grayscale: boolean
  sepia: boolean
  invert: boolean
  blur: boolean
  sharpen: boolean
  autoContrast: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  grayscale: false,
  sepia: false,
  invert: false,
  blur: false,
  sharpen: false,
  autoContrast: false,
}

export function cloneFilters(filters: FilterState): FilterState {
  return { ...filters }
}

export function hasActiveFilter(filters: FilterState): boolean {
  return FILTERS.some((name) => filters[name])
}

/**
 * Apply every enabled filter to an ImageData, in place.
 */
export function applyFilters(image: ImageData, filters: FilterState): void {
  if (filters.autoContrast) {
    autoContrast(image)
  }
  if (filters.blur) {
    blur(image)
  }
  if (filters.sharpen) {
    sharpen(image)
  }
  if (filters.grayscale) {
    grayscale(image)
  }
  if (filters.sepia) {
    sepia(image)
  }
  if (filters.invert) {
    invert(image)
  }
}

export function grayscale(image: ImageData): void {
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }
}

export function sepia(image: ImageData): void {
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    data[i] = clamp255(0.393 * r + 0.769 * g + 0.189 * b)
    data[i + 1] = clamp255(0.349 * r + 0.686 * g + 0.168 * b)
    data[i + 2] = clamp255(0.272 * r + 0.534 * g + 0.131 * b)
  }
}

export function invert(image: ImageData): void {
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]!
    data[i + 1] = 255 - data[i + 1]!
    data[i + 2] = 255 - data[i + 2]!
  }
}

/**
 * Stretch each channel so the darkest sample maps to 0 and the brightest to
 * 255.
 *
 * A channel with no variation has no range to stretch; it is left untouched
 * rather than mapped to black, which is what a plain `(v - lo) / span` would
 * do for a solid-colour image.
 */
export function autoContrast(image: ImageData): void {
  const data = image.data
  const min = [255, 255, 255]
  const max = [0, 0, 0]

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const value = data[i + c]!
      if (value < min[c]!) min[c] = value
      if (value > max[c]!) max[c] = value
    }
  }

  const lut = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)]
  for (let c = 0; c < 3; c += 1) {
    const lo = min[c]!
    const hi = max[c]!
    const span = hi - lo

    for (let i = 0; i < 256; i += 1) {
      lut[c]![i] = span === 0 ? i : clamp255(((i - lo) / span) * 255)
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[0]![data[i]!]!
    data[i + 1] = lut[1]![data[i + 1]!]!
    data[i + 2] = lut[2]![data[i + 2]!]!
  }
}

/**
 * A 3x3 box blur, separable into a horizontal then a vertical pass.
 */
export function blur(image: ImageData): void {
  boxBlur(image, 1)
}

/**
 * A 3x3 unsharp-style kernel that emphasises edges.
 */
export function sharpen(image: ImageData): void {
  convolve(image, [0, -1, 0, -1, 5, -1, 0, -1, 0])
}

function boxBlur(image: ImageData, radius: number): void {
  const { width, height, data } = image
  const source = new Uint8ClampedArray(data)
  const size = radius * 2 + 1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0

      for (let dy = -radius; dy <= radius; dy += 1) {
        const sy = y + dy
        if (sy < 0 || sy >= height) continue
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = x + dx
          if (sx < 0 || sx >= width) continue
          const offset = (sy * width + sx) * 4
          r += source[offset]!
          g += source[offset + 1]!
          b += source[offset + 2]!
          a += source[offset + 3]!
          count += 1
        }
      }

      const offset = (y * width + x) * 4
      data[offset] = r / count
      data[offset + 1] = g / count
      data[offset + 2] = b / count
      data[offset + 3] = a / count
    }
  }

  void size
}

function convolve(image: ImageData, kernel: number[]): void {
  const { width, height, data } = image
  const source = new Uint8ClampedArray(data)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let k = 0

      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sy = Math.min(height - 1, Math.max(0, y + ky))
          const sx = Math.min(width - 1, Math.max(0, x + kx))
          const offset = (sy * width + sx) * 4
          const weight = kernel[k++] ?? 0
          r += source[offset]! * weight
          g += source[offset + 1]! * weight
          b += source[offset + 2]! * weight
        }
      }

      const offset = (y * width + x) * 4
      data[offset] = clamp255(r)
      data[offset + 1] = clamp255(g)
      data[offset + 2] = clamp255(b)
    }
  }
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value
}
