/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * The subset of the PSD file header the editor needs.
 *
 * Field names follow Adobe's PSD specification so a reader can be checked
 * against the spec directly.
 */
export interface PsdHeader {
  /** `8BPS` for every valid file. */
  signature: string
  /** 1 for PSD, 2 for PSB (large documents). */
  version: number
  /** Always 6. */
  channels: number
  height: number
  width: number
  /** 1, 8, 16 or 32. */
  depth: number
  /** 0 = bitmap, 1 = grayscale, 2 = indexed, 3 = RGB, 4 = CMYK, 7 = multichannel, 8 = duotone, 9 = Lab. */
  colorMode: number
}

/**
 * Colour mode constants from the PSD specification.
 */
export const ColorMode = {
  BITMAP: 0,
  GRAYSCALE: 1,
  INDEXED: 2,
  RGB: 3,
  CMYK: 4,
  MULTICHANNEL: 7,
  DUOTONE: 8,
  LAB: 9,
} as const

/**
 * Channel id constants used inside a layer record.
 */
export const ChannelId = {
  RED: 0,
  GREEN: 1,
  BLUE: 2,
  /** -1: transparency mask. */
  TRANSPARENCY: -1,
  /** -2: user-supplied layer mask. */
  USER_MASK: -2,
  /** -3: real user-supplied layer mask. */
  REAL_USER_MASK: -3,
} as const

export interface PsdChannelInfo {
  id: number
  /** Length of the channel data in bytes. */
  length: number
}

export interface PsdLayerMask {
  top: number
  left: number
  bottom: number
  right: number
  /** 0 = position relative to layer, 1 = relative to document. */
  defaultColor: number
  disabled: boolean
  /** Which channel holds the mask data (-2 or -3). */
  channelId: number
  length: number
}

/**
 * A parsed layer, holding the raw (still compressed) channel data.
 *
 * Decompression is deliberately separate: it is the expensive step, so the
 * caller can decode only the layers it needs to draw.
 */
export interface PsdLayer {
  name: string
  /** Bounds of the layer inside the document, in pixels. */
  top: number
  left: number
  bottom: number
  right: number
  /** 0 = normal, 1 = multiply, 2 = screen, ... see BLEND_MODES. */
  blendMode: number
  /** 0..255; the layer's overall opacity. */
  opacity: number
  /** 0 = visible, 1 = hidden (PSD stores "flags"). */
  visible: boolean
  /** Whether the layer is clipped to the layer below it. */
  clipping: boolean
  /** Whether the layer should be treated as a group container. */
  isGroup: boolean
  /** The 4-character section divider type for groups, or empty. */
  sectionDivider: string
  channels: PsdChannelInfo[]
  /** Raw, still-compressed channel data, keyed by channel id. */
  channelData: Map<number, Uint8Array>
  mask: PsdLayerMask | null
  children: PsdLayer[]
}

export interface PsdImageResource {
  id: number
  name: string
  data: Uint8Array
}

export interface PsdDocument {
  header: PsdHeader
  /** Colour mode data section, only present for indexed/duotone. */
  colorModeData: Uint8Array
  imageResources: PsdImageResource[]
  layers: PsdLayer[]
  /**
   * The trailing Image Data Section: the merged, flattened image Photoshop
   * wrote. Raw and still compressed; the compositor decodes it on demand.
   */
  imageData: Uint8Array
}

/**
 * PSD blend mode ids, in the order the specification lists them.
 */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const

export type BlendMode = (typeof BLEND_MODES)[number]

export function blendModeName(id: number): BlendMode {
  return BLEND_MODES[id] ?? 'normal'
}

/**
 * Whether a layer participates in the composite.
 *
 * A hidden layer, a group container, or a layer with zero opacity contributes
 * nothing and is skipped by the compositor.
 */
export function isDrawable(layer: PsdLayer): boolean {
  return layer.visible && !layer.isGroup && layer.opacity > 0
}
