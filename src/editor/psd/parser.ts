/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * A reader for Adobe Photoshop PSD (version 1) and PSB (version 2) files,
 * written from Adobe's published specification.
 *
 * Parsing is synchronous and does not decompress pixels: channel data is kept
 * compressed and inflated later, by the compositor, only for the channels it
 * needs. That keeps opening a large document cheap.
 *
 * The merged (flattened) image lives in the trailing Image Data Section, which
 * is captured here as raw bytes and decoded lazily by the compositor.
 */

import { ByteReader } from './binary'
import {
  ChannelId,
  type PsdChannelInfo,
  type PsdDocument,
  type PsdHeader,
  type PsdImageResource,
  type PsdLayer,
  type PsdLayerMask,
} from './types'

/** Signature that begins every image resource and additional-info block. */
const RESOURCE_SIGNATURE = '8BIM'
const RESOURCE_SIGNATURE_64 = '8B64'

/**
 * Largest canvas the reader will accept, in pixels.
 *
 * The compositor allocates several full-size buffers per channel, so a small
 * file that declares an enormous canvas would exhaust the tab's memory. 256M
 * pixels is well above any real document (a 16000x16000 image) while staying
 * within what a browser can hold.
 */
const MAX_PIXELS = 256 * 1024 * 1024

/**
 * Tagged-block keys whose length is 64-bit in PSB files.
 *
 * Everything else keeps the 4-byte length even in PSB, so `luni` and `lsct`
 * must not be read as 64-bit or the block boundary is lost.
 */
const LARGE_TAGGED_KEYS = new Set([
  'LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk',
  'lnk2', 'FEid', 'FXid', 'PxSD', 'cinf', 'lnk3', 'lnkE', 'pths', 'extd',
  'extn', 'FELS', 'artd',
])

export class PsdParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PsdParseError'
  }
}

/**
 * Parse a PSD or PSB document.
 *
 * @throws {PsdParseError} when the file is not a PSD/PSB, is truncated, or
 *   declares a structure the reader cannot follow.
 */
export function parsePsd(bytes: Uint8Array): PsdDocument {
  const reader = new ByteReader(bytes)
  const header = readHeader(reader)
  const isPsb = header.version === 2

  // The colour mode data and image resource section lengths stay 32-bit in
  // PSB; only the layer/mask and image data sections use the 64-bit form.
  const colorModeData = readLengthPrefixed(reader, false)
  const imageResources = readImageResources(reader, false)
  const layerAndMask = readLengthPrefixed(reader, isPsb)
  const layers = readLayers(layerAndMask, isPsb)

  // Everything after the layer section is the merged image, written with a
  // single compression tag followed by every channel.
  const imageData = reader.remaining > 0 ? reader.readBytes(reader.remaining) : new Uint8Array(0)

  return { header, colorModeData, imageResources, layers, imageData }
}

function readHeader(reader: ByteReader): PsdHeader {
  const signature = reader.readSignature()
  if (signature !== '8BPS') {
    throw new PsdParseError(`Not a PSD file: signature "${signature}"`)
  }

  const version = reader.readUint16()
  if (version !== 1 && version !== 2) {
    throw new PsdParseError(`Unsupported PSD version: ${version}`)
  }

  reader.skip(6) // reserved, must be zero

  const channels = reader.readUint16()
  const height = reader.readUint32()
  const width = reader.readUint32()
  const depth = reader.readUint16()
  const colorMode = reader.readUint16()

  if (channels < 1 || channels > 56) {
    throw new PsdParseError(`Implausible channel count: ${channels}`)
  }
  if (width < 1 || height < 1) {
    throw new PsdParseError(`Invalid dimensions: ${width}x${height}`)
  }
  // A small file can declare a huge canvas; the compositor allocates pixel
  // buffers from these numbers, so they are bounded before anything uses them.
  if (width * height > MAX_PIXELS) {
    throw new PsdParseError(
      `Document is too large to render: ${width}x${height} exceeds ${MAX_PIXELS} pixels`,
    )
  }
  if (depth !== 1 && depth !== 8 && depth !== 16 && depth !== 32) {
    throw new PsdParseError(`Unsupported bit depth: ${depth}`)
  }

  return { signature, version, channels, height, width, depth, colorMode }
}

/**
 * Read a 4-byte (PSD) or 8-byte (PSB) length followed by that many bytes.
 */
function readLengthPrefixed(reader: ByteReader, isPsb: boolean): Uint8Array {
  const length = isPsb ? readUint64(reader) : reader.readUint32()
  if (length === 0) {
    return new Uint8Array(0)
  }
  if (length > reader.remaining) {
    throw new PsdParseError(
      `Section length ${length} exceeds the remaining ${reader.remaining} bytes`,
    )
  }
  return reader.readBytes(length)
}

/**
 * Read an unsigned 64-bit length.
 *
 * PSD section lengths never approach 2^53, so reading the high word and
 * checking it is enough to stay exact and to reject absurd values.
 */
function readUint64(reader: ByteReader): number {
  const high = reader.readUint32()
  const low = reader.readUint32()
  if (high > 0x1fffff) {
    throw new PsdParseError('Section length is too large to address')
  }
  return high * 0x100000000 + low
}

function readImageResources(reader: ByteReader, isPsb: boolean): PsdImageResource[] {
  const section = readLengthPrefixed(reader, isPsb)
  const resources: PsdImageResource[] = []
  const sub = new ByteReader(section)

  while (sub.remaining >= 12) {
    const start = sub.position
    const signature = sub.readSignature()
    if (signature !== RESOURCE_SIGNATURE && signature !== RESOURCE_SIGNATURE_64) {
      // A resource block we cannot locate the end of; stop rather than guess.
      sub.seek(start)
      break
    }

    const id = sub.readUint16()
    const name = sub.readPascalString(2)
    const size = sub.readUint32()

    if (size > sub.remaining) {
      break
    }

    resources.push({ id, name, data: sub.readBytes(size) })

    // Resource data is padded to an even length.
    if (size % 2 !== 0 && sub.remaining > 0) {
      sub.skip(1)
    }
  }

  return resources
}

/**
 * Read the layer records and their channel data.
 */
function readLayers(section: Uint8Array, isPsb: boolean): PsdLayer[] {
  if (section.length === 0) {
    return []
  }

  const reader = new ByteReader(section)

  const layerInfoLength = isPsb ? readUint64(reader) : reader.readUint32()
  if (layerInfoLength === 0 || layerInfoLength > reader.remaining) {
    return []
  }

  const layerInfo = new ByteReader(reader.readBytes(layerInfoLength))
  const layerCount = layerInfo.readInt16()
  const records = readLayerRecords(layerInfo, Math.abs(layerCount), isPsb)
  readLayerChannelData(layerInfo, records)

  return buildLayerTree(records)
}

function readLayerRecords(reader: ByteReader, count: number, isPsb: boolean): PsdLayer[] {
  const layers: PsdLayer[] = []

  for (let i = 0; i < count; i += 1) {
    const top = reader.readInt32()
    const left = reader.readInt32()
    const bottom = reader.readInt32()
    const right = reader.readInt32()

    const channelCount = reader.readUint16()
    const channels: PsdChannelInfo[] = []
    for (let c = 0; c < channelCount; c += 1) {
      const id = reader.readInt16()
      const length = isPsb ? readUint64(reader) : reader.readUint32()
      channels.push({ id, length })
    }

    const blendSignature = reader.readSignature()
    if (blendSignature !== RESOURCE_SIGNATURE) {
      throw new PsdParseError(`Bad blend mode signature in layer ${i}: "${blendSignature}"`)
    }

    const blendMode = blendModeKeyToId(reader.readSignature())
    const opacity = reader.readUint8()
    const clipping = reader.readUint8() !== 0
    const flags = reader.readUint8()
    reader.readUint8() // filler

    const extraLength = reader.readUint32()
    if (extraLength > reader.remaining) {
      throw new PsdParseError(`Layer ${i} extra data is truncated`)
    }

    const extra = new ByteReader(reader.readBytes(extraLength))
    const mask = readLayerMask(extra)
    readBlendingRanges(extra)

    let name = extra.readPascalString(4)
    let sectionDivider = ''

    // Additional layer information blocks.
    while (extra.remaining >= 12) {
      const start = extra.position
      const signature = extra.readSignature()
      if (signature !== RESOURCE_SIGNATURE && signature !== RESOURCE_SIGNATURE_64) {
        extra.seek(start)
        break
      }

      const key = extra.readSignature()
      // Only the documented large blocks use the 64-bit length in PSB; the
      // rest, including `luni` and `lsct`, keep the 4-byte form.
      const length = isPsb && (signature === RESOURCE_SIGNATURE_64 || LARGE_TAGGED_KEYS.has(key))
        ? readUint64(extra)
        : extra.readUint32()
      if (length > extra.remaining) {
        break
      }

      const block = extra.readBytes(length)

      if (key === 'luni') {
        name = readUnicodeName(block) || name
      } else if (key === 'lsct' || key === 'lsdk') {
        sectionDivider = readSectionDivider(block)
      }

      // Blocks are padded to an even length.
      if (length % 2 !== 0 && extra.remaining > 0) {
        extra.skip(1)
      }
    }

    layers.push({
      name,
      top,
      left,
      bottom,
      right,
      blendMode,
      opacity,
      visible: (flags & 0x02) === 0,
      clipping,
      isGroup: sectionDivider === 'open' || sectionDivider === 'closed',
      sectionDivider,
      channels,
      channelData: new Map<number, Uint8Array>(),
      mask,
      children: [],
    })
  }

  return layers
}

function readLayerMask(reader: ByteReader): PsdLayerMask | null {
  const length = reader.readUint32()
  if (length === 0) {
    return null
  }
  if (length > reader.remaining) {
    return null
  }

  const sub = new ByteReader(reader.readBytes(length))
  const top = sub.readInt32()
  const left = sub.readInt32()
  const bottom = sub.readInt32()
  const right = sub.readInt32()
  const defaultColor = sub.readUint8()
  const flags = sub.readUint8()

  return {
    top,
    left,
    bottom,
    right,
    defaultColor,
    disabled: (flags & 0x02) !== 0,
    channelId: ChannelId.USER_MASK,
    length,
  }
}

function readBlendingRanges(reader: ByteReader): void {
  if (reader.remaining < 4) {
    return
  }
  const length = reader.readUint32()
  if (length > 0 && length <= reader.remaining) {
    reader.skip(length)
  }
}

/**
 * Read a `luni` block into a string.
 *
 * The leading count is the number of UTF-16 code units, not bytes, so the
 * string is `length * 2` bytes long. Reading only `length` bytes truncates
 * every name with unicode metadata to roughly half its characters.
 */
function readUnicodeName(block: Uint8Array): string {
  const sub = new ByteReader(block)
  if (sub.remaining < 4) {
    return ''
  }

  const units = sub.readUint32()
  if (units < 1) {
    return ''
  }

  const byteLength = Math.min(units * 2, sub.remaining)
  const utf16 = sub.readBytes(byteLength)
  let out = ''
  for (let i = 0; i + 1 < utf16.length; i += 2) {
    const code = (utf16[i]! << 8) | utf16[i + 1]!
    if (code === 0) {
      break
    }
    out += String.fromCharCode(code)
  }
  return out
}

function readSectionDivider(block: Uint8Array): string {
  if (block.length < 4) {
    return ''
  }
  const type = ((block[0]! << 24) | (block[1]! << 16) | (block[2]! << 8) | block[3]!) >>> 0
  switch (type) {
    case 1:
      return 'open'
    case 2:
      return 'closed'
    case 3:
      return 'bounding'
    default:
      return 'other'
  }
}

/**
 * Blend mode key (a 4-char code such as `norm`) to the numeric id the
 * compositor uses.
 *
 * The keys are exactly four bytes, so several carry a trailing space and some
 * mix case (`hLit` is hard light, `hlit` is not a key at all). They are
 * matched verbatim; trimming or lower-casing would misread those layers as
 * normal.
 */
function blendModeKeyToId(key: string): number {
  const map: Record<string, number> = {
    norm: 0,
    'mul ': 1,
    scrn: 2,
    over: 3,
    dark: 4,
    lite: 5,
    idiv: 6,
    lbrn: 7,
    hLit: 8,
    sLit: 9,
    diff: 10,
    smud: 11,
    'hue ': 12,
    'sat ': 13,
    colr: 14,
    'lum ': 15,
  }
  return map[key] ?? 0
}

/**
 * Read the per-layer channel image data that follows the layer records.
 *
 * Channels are stored in the same order as the records, so the reader walks
 * both together. The data is kept compressed; only the compositor decodes it.
 */
function readLayerChannelData(reader: ByteReader, layers: PsdLayer[]): void {
  for (const layer of layers) {
    for (const channel of layer.channels) {
      if (channel.length === 0) {
        layer.channelData.set(channel.id, new Uint8Array(0))
        continue
      }

      if (channel.length > reader.remaining) {
        // A truncated tail: keep what was decoded rather than failing the whole
        // file, since the layers read so far are still drawable.
        return
      }

      layer.channelData.set(channel.id, reader.readBytes(channel.length))
    }
  }
}

/**
 * Build the layer tree from the flat, Photoshop-order record list.
 *
 * Photoshop stores layers bottom-to-top. A group is bracketed by two records:
 * a "bounding section divider" (type 3) at the group's bottom and the group
 * header (type 1/2) at its top. Reversing the list puts the header first, so a
 * forward pass can open a group when it meets the header and close it when it
 * meets the bounding divider, collecting the contents in between.
 */
function buildLayerTree(records: PsdLayer[]): PsdLayer[] {
  const root: PsdLayer[] = []
  const stack: PsdLayer[][] = [root]

  for (let i = records.length - 1; i >= 0; i -= 1) {
    const layer = records[i]!
    const current = stack[stack.length - 1]!

    if (layer.sectionDivider === 'bounding') {
      // Closes the group whose header was read just before it.
      if (stack.length > 1) {
        stack.pop()
      }
      continue
    }

    if (layer.isGroup) {
      current.push(layer)
      stack.push(layer.children)
      continue
    }

    current.push(layer)
  }

  return root
}
