/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Build a minimal but spec-correct PSD file for tests.
 *
 * Only the fields the reader inspects are written, but the byte layout follows
 * Adobe's specification so the reader is exercised on real structure rather
 * than a bespoke format.
 */

class Writer {
  private bytes: number[] = []

  u8(value: number): this {
    this.bytes.push(value & 0xff)
    return this
  }

  u16(value: number): this {
    this.bytes.push((value >> 8) & 0xff, value & 0xff)
    return this
  }

  i16(value: number): this {
    return this.u16(value < 0 ? value + 0x10000 : value)
  }

  u32(value: number): this {
    this.bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    )
    return this
  }

  i32(value: number): this {
    return this.u32(value < 0 ? value + 0x100000000 : value)
  }

  signature(text: string): this {
    for (const char of text) {
      this.bytes.push(char.charCodeAt(0))
    }
    return this
  }

  raw(values: number[] | Uint8Array): this {
    for (const value of values) {
      this.bytes.push(value & 0xff)
    }
    return this
  }

  /** A Pascal string padded so the total length is a multiple of `padTo`. */
  pascalString(text: string, padTo = 2): this {
    const encoded = Array.from(text).map((c) => c.charCodeAt(0) & 0xff)
    this.u8(encoded.length)
    this.raw(encoded)
    const total = encoded.length + 1
    const padding = (padTo - (total % padTo)) % padTo
    for (let i = 0; i < padding; i += 1) {
      this.u8(0)
    }
    return this
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

export interface LayerSpec {
  name: string
  top: number
  left: number
  bottom: number
  right: number
  /** RGBA planes, each `width * height` bytes, already 8-bit. */
  channels?: { r: number[]; g: number[]; b: number[]; a: number[] }
  opacity?: number
  visible?: boolean
  blendKey?: string
}

export interface PsdSpec {
  width: number
  height: number
  colorMode?: number
  layers?: LayerSpec[]
  /** A raw (uncompressed) merged image, RGB planes. */
  merged?: { r: number[]; g: number[]; b: number[] }
  /** Whether the merged image also carries an alpha channel. */
  mergedAlpha?: boolean
}

function rawChannel(bytes: number[]): Uint8Array {
  const writer = new Writer()
  writer.u16(0) // compression: raw
  writer.raw(bytes)
  return writer.toUint8Array()
}

/**
 * Build a PSD file from a spec.
 *
 * Only 8-bit documents are produced: the pixel data written here is one byte
 * per sample, so a fixture claiming 16- or 32-bit depth would declare lengths
 * that do not match its contents and would test the decoder against a file no
 * writer produces.
 */
export function buildPsd(spec: PsdSpec): Uint8Array {
  const { width, height } = spec
  const depth = 8
  const colorMode = spec.colorMode ?? 3
  const layers = spec.layers ?? []

  // The header's channel count describes the merged image, not the layers: RGB
  // plus alpha only when the merged planes actually include one.
  const headerChannels = spec.mergedAlpha ? 4 : 3

  const out = new Writer()
  out.signature('8BPS')
  out.u16(1) // version 1 = PSD
  out.raw([0, 0, 0, 0, 0, 0]) // reserved
  out.u16(headerChannels)
  out.u32(height)
  out.u32(width)
  out.u16(depth)
  out.u16(colorMode)

  // Colour mode data: empty.
  out.u32(0)

  // Image resources: one trivial 8BIM block so the section is not empty.
  const resource = new Writer()
  resource.signature('8BIM')
  resource.u16(0x0404) // IPTC-ish id, arbitrary
  resource.pascalString('', 2)
  resource.u32(4)
  resource.raw([0, 0, 0, 0])
  const resourceBytes = resource.toUint8Array()
  out.u32(resourceBytes.length)
  out.raw(resourceBytes)

  // Layer and mask information.
  const layerInfo = new Writer()
  layerInfo.i16(layers.length)

  // Records first...
  for (const layer of layers) {
    layerInfo.i32(layer.top)
    layerInfo.i32(layer.left)
    layerInfo.i32(layer.bottom)
    layerInfo.i32(layer.right)

    const channelCount = layer.channels ? 4 : 3
    layerInfo.u16(channelCount)

    const w = layer.right - layer.left
    const h = layer.bottom - layer.top
    const planeLength = w * h

    const channelIds = layer.channels ? [0, 1, 2, -1] : [0, 1, 2]
    for (const id of channelIds) {
      layerInfo.i16(id)
      // 2-byte compression tag + planeLength bytes.
      layerInfo.u32(2 + planeLength)
    }

    layerInfo.signature('8BIM')
    layerInfo.signature(layer.blendKey ?? 'norm')
    layerInfo.u8(layer.opacity ?? 255)
    layerInfo.u8(0) // clipping
    layerInfo.u8(layer.visible === false ? 0x02 : 0x00) // flags
    layerInfo.u8(0) // filler

    // Extra data: mask (none) + blending ranges (none) + Pascal name.
    const extra = new Writer()
    extra.u32(0) // no mask
    extra.u32(0) // no blending ranges
    extra.pascalString(layer.name, 4)
    const extraBytes = extra.toUint8Array()
    layerInfo.u32(extraBytes.length)
    layerInfo.raw(extraBytes)
  }

  // ...then their channel data, in the same order.
  for (const layer of layers) {
    const w = layer.right - layer.left
    const h = layer.bottom - layer.top
    const planes = layer.channels ?? {
      r: new Array(w * h).fill(0),
      g: new Array(w * h).fill(0),
      b: new Array(w * h).fill(0),
    }

    layerInfo.raw(rawChannel(planes.r))
    layerInfo.raw(rawChannel(planes.g))
    layerInfo.raw(rawChannel(planes.b))
    if (layer.channels) {
      layerInfo.raw(rawChannel(planes.a))
    }
  }

  const layerInfoBytes = layerInfo.toUint8Array()
  const layerAndMask = new Writer()
  layerAndMask.u32(layerInfoBytes.length)
  layerAndMask.raw(layerInfoBytes)
  layerAndMask.u32(0) // global layer mask info length
  const layerAndMaskBytes = layerAndMask.toUint8Array()

  out.u32(layerAndMaskBytes.length)
  out.raw(layerAndMaskBytes)

  // Merged image data.
  if (spec.merged) {
    out.u16(0) // raw
    out.raw(spec.merged.r)
    out.raw(spec.merged.g)
    out.raw(spec.merged.b)

    if (spec.mergedAlpha) {
      // The header declared a fourth channel, so the section must carry it.
      out.raw(new Array(width * height).fill(255))
    }
  }

  return out.toUint8Array()
}
