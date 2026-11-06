/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Decompression of a single PSD channel to 8-bit samples.
 *
 * A channel is stored with a 2-byte compression tag:
 *   0 raw, 1 PackBits RLE, 2 ZIP without prediction, 3 ZIP with prediction.
 *
 * The compositor only needs 8-bit samples, so 16- and 32-bit channels are
 * reduced to 8 bits on the way out. For a 32-bit (float) channel that is a
 * proper range reduction rather than a byte slice: the samples are IEEE-754
 * floats in 0..1, and taking the top byte of the mantissa would map a mid-grey
 * 0.5 to roughly 0 rather than to 128.
 */

import { ByteReader, inflate } from './binary'

export const Compression = {
  RAW: 0,
  RLE: 1,
  ZIP: 2,
  ZIP_PREDICTION: 3,
} as const

export class PsdDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PsdDecodeError'
  }
}

/**
 * Decode a channel to a `width * height` byte plane of 8-bit samples.
 *
 * @param data The raw channel bytes, including the 2-byte compression tag.
 * @param width  Channel width in pixels.
 * @param height Channel height in pixels.
 * @param depth  Bit depth from the header (1, 8, 16 or 32).
 * @param isPsb  PSB files use 4-byte RLE row counts instead of 2.
 */
export async function decodeChannel(
  data: Uint8Array,
  width: number,
  height: number,
  depth: number,
  isPsb: boolean,
): Promise<Uint8Array> {
  const pixels = width * height
  if (pixels === 0) {
    return new Uint8Array(0)
  }

  if (data.length < 2) {
    throw new PsdDecodeError('Channel data is too short')
  }

  const reader = new ByteReader(data)
  const compression = reader.readUint16()

  switch (compression) {
    case Compression.RAW:
      return fromRaw(reader, pixels, depth)
    case Compression.RLE:
      return fromRle(reader, width, height, depth, isPsb)
    case Compression.ZIP:
    case Compression.ZIP_PREDICTION:
      return fromZip(reader, width, height, depth, compression)
    default:
      throw new PsdDecodeError(`Unsupported channel compression: ${compression}`)
  }
}

function bytesPerSample(depth: number): number {
  return depth === 1 ? 1 : depth / 8
}

/**
 * Reduce one sample to an 8-bit value.
 *
 * 16-bit samples are big-endian and are reduced by taking the high byte, which
 * is the standard way to display them. 32-bit samples are big-endian IEEE-754
 * floats in 0..1 and are scaled to the full range.
 */
function sampleTo8Bit(bytes: Uint8Array, offset: number, depth: number): number {
  switch (depth) {
    case 8:
      return bytes[offset]!
    case 16:
      return bytes[offset]!
    case 32: {
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4)
      const value = view.getFloat32(0, false)
      if (!Number.isFinite(value)) {
        return 0
      }
      return Math.max(0, Math.min(255, Math.round(value * 255)))
    }
    default:
      return bytes[offset]!
  }
}

function fromRaw(reader: ByteReader, pixels: number, depth: number): Uint8Array {
  if (depth === 1) {
    return unpackBits(reader.readBytes(Math.min(reader.remaining, Math.ceil(pixels / 8))), pixels)
  }

  const size = bytesPerSample(depth)
  const available = Math.floor(reader.remaining / size)
  const count = Math.min(pixels, available)
  const out = new Uint8Array(pixels)

  const bytes = reader.readBytes(count * size)
  for (let i = 0; i < count; i += 1) {
    out[i] = sampleTo8Bit(bytes, i * size, depth)
  }

  return out
}

/**
 * Expand a packed 1-bit plane.
 *
 * A 1-bit channel packs eight pixels per byte, most significant bit first. A
 * white pixel is 1 and black is 0, so each bit becomes 255 or 0.
 */
function unpackBits(bytes: Uint8Array, pixels: number): Uint8Array {
  const out = new Uint8Array(pixels)

  for (let i = 0; i < pixels; i += 1) {
    const byte = bytes[i >> 3]
    if (byte === undefined) {
      break
    }
    out[i] = (byte >> (7 - (i & 7))) & 0x01 ? 255 : 0
  }

  return out
}

/**
 * Decode a packed 1-bit plane into bytes, padded to the row's byte width.
 *
 * RLE rows are packed the same way as raw ones, so a decoded row must be
 * unpacked before its pixels are read; treating each packed byte as one pixel
 * would shift every pixel after the first eight.
 */
function unpackRow(rowBytes: Uint8Array, width: number): Uint8Array {
  const out = new Uint8Array(width)
  for (let x = 0; x < width; x += 1) {
    const byte = rowBytes[x >> 3]
    if (byte === undefined) {
      break
    }
    out[x] = (byte >> (7 - (x & 7))) & 0x01 ? 255 : 0
  }
  return out
}

async function fromRle(
  reader: ByteReader,
  width: number,
  height: number,
  depth: number,
  isPsb: boolean,
): Promise<Uint8Array> {
  const size = bytesPerSample(depth)

  // RLE begins with a byte count for every row of the channel.
  const rowCounts = new Uint32Array(height)
  for (let row = 0; row < height; row += 1) {
    rowCounts[row] = isPsb ? reader.readUint32() : reader.readUint16()
  }

  const out = new Uint8Array(width * height)
  let outIndex = 0

  for (let row = 0; row < height; row += 1) {
    const count = rowCounts[row]!
    if (count > reader.remaining) {
      break
    }

    const decoded = decodePackBits(reader.readBytes(count))

    if (depth === 1) {
      out.set(unpackRow(decoded, width), outIndex)
      outIndex += width
      continue
    }

    const samples = Math.floor(decoded.length / size)
    for (let x = 0; x < width; x += 1) {
      if (x < samples) {
        out[outIndex] = sampleTo8Bit(decoded, x * size, depth)
      }
      outIndex += 1
    }
  }

  return out
}

async function fromZip(
  reader: ByteReader,
  width: number,
  height: number,
  depth: number,
  compression: number,
): Promise<Uint8Array> {
  const size = bytesPerSample(depth)
  const expected = width * height * size

  const inflated = await inflateChannel(reader.readBytes(reader.remaining), expected)

  const plane = compression === Compression.ZIP_PREDICTION
    ? undoPrediction(inflated, width, height, depth)
    : inflated

  if (depth === 1) {
    return unpackBits(plane, width * height)
  }

  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = sampleTo8Bit(plane, i * size, depth)
  }
  return out
}

/**
 * Inflate a channel, bounded to the size it is expected to occupy.
 *
 * A small, highly compressible stream can expand to gigabytes; inflating it in
 * full before checking the length would exhaust the tab's memory. The result
 * is truncated to `expected` bytes, and a short result is zero-padded so a
 * truncated file still renders what it did contain.
 */
async function inflateChannel(compressed: Uint8Array, expected: number): Promise<Uint8Array> {
  const raw = await inflate(compressed, expected)
  if (raw === null) {
    throw new PsdDecodeError('Could not inflate a ZIP-compressed channel')
  }
  return raw.length >= expected ? raw : padTo(raw, expected)
}

/**
 * Reverse the horizontal delta prediction PSD applies before deflating.
 *
 * The prediction runs along each row, and its unit depends on the depth:
 *
 *  - 8-bit: one byte at a time.
 *  - 16-bit: one big-endian 16-bit sample at a time, wrapping at 16 bits, so a
 *    carry propagates from the low byte into the high byte of the same sample.
 *  - 32-bit: the row is stored as four byte planes (every first byte, then
 *    every second byte, and so on) and the delta runs across that flattened
 *    sequence, one byte at a time. The planes are re-interleaved afterwards.
 *
 * Returns the plane in sample order; the 32-bit case needs a new buffer
 * because re-interleaving moves bytes.
 */
export function undoPrediction(
  plane: Uint8Array,
  width: number,
  height: number,
  depth: number,
): Uint8Array {
  if (depth === 32) {
    return undoPrediction32(plane, width, height)
  }

  const size = depth === 1 ? 1 : depth / 8

  for (let row = 0; row < height; row += 1) {
    const start = row * width * size
    for (let x = 1; x < width; x += 1) {
      const index = start + x * size
      const previous = start + (x - 1) * size

      let carry = 0
      for (let b = size - 1; b >= 0; b -= 1) {
        const sum = plane[index + b]! + plane[previous + b]! + carry
        plane[index + b] = sum & 0xff
        carry = sum >> 8
      }
    }
  }

  return plane
}

/**
 * Reverse the 32-bit prediction and restore sample order.
 *
 * Each row holds four byte planes, each `width` bytes, and the delta runs
 * across all `4 * width` bytes in sequence. Decoding therefore sums the whole
 * row, then gathers byte `k` of sample `x` from plane `k`.
 */
function undoPrediction32(plane: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4
  const out = new Uint8Array(width * height * 4)

  for (let row = 0; row < height; row += 1) {
    const start = row * stride

    for (let i = 1; i < stride; i += 1) {
      plane[start + i] = (plane[start + i]! + plane[start + i - 1]!) & 0xff
    }

    for (let x = 0; x < width; x += 1) {
      const dst = (row * width + x) * 4
      out[dst] = plane[start + x]!
      out[dst + 1] = plane[start + width + x]!
      out[dst + 2] = plane[start + 2 * width + x]!
      out[dst + 3] = plane[start + 3 * width + x]!
    }
  }

  return out
}

function padTo(data: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length)
  out.set(data.subarray(0, Math.min(data.length, length)))
  return out
}

/**
 * Decode a PackBits (RLE) block.
 *
 * A control byte n means: 0..127 copy the next n+1 bytes literally, 129..255
 * repeat the next byte 257-n times, and 128 is a no-op.
 *
 * Output is bounded to `limit` bytes: a crafted row can declare a run far
 * larger than the row could hold, and expanding it before the caller checks
 * would let a small file exhaust memory.
 */
export function decodePackBits(data: Uint8Array, limit = Number.MAX_SAFE_INTEGER): Uint8Array {
  const out = new Uint8Array(Math.min(limit, data.length * 128))
  let length = 0
  let i = 0

  const push = (value: number, count: number): boolean => {
    for (let n = 0; n < count; n += 1) {
      if (length >= out.length) {
        return false
      }
      out[length++] = value
    }
    return true
  }

  while (i < data.length) {
    const control = data[i]!
    i += 1

    if (control < 128) {
      const count = control + 1
      for (let n = 0; n < count && i < data.length; n += 1) {
        if (!push(data[i]!, 1)) {
          return out.subarray(0, length)
        }
        i += 1
      }
    } else if (control > 128) {
      const count = 257 - control
      if (i < data.length) {
        if (!push(data[i]!, count)) {
          return out.subarray(0, length)
        }
        i += 1
      }
    }
  }

  return out.subarray(0, length)
}
