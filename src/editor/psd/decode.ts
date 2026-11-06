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
    return fromRawBits(reader, pixels)
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
 * Expand a raw 1-bit plane.
 *
 * A 1-bit channel packs eight pixels per byte, most significant bit first.
 */
function fromRawBits(reader: ByteReader, pixels: number): Uint8Array {
  const bytes = reader.readBytes(Math.min(reader.remaining, Math.ceil(pixels / 8)))
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

    const rowBytes = decodePackBits(reader.readBytes(count))
    const samples = Math.floor(rowBytes.length / size)

    for (let x = 0; x < width; x += 1) {
      if (x >= samples) {
        outIndex += 1
        continue
      }
      out[outIndex] = sampleTo8Bit(rowBytes, x * size, depth)
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
  const compressed = reader.readBytes(reader.remaining)
  const raw = await inflate(compressed)
  if (raw === null) {
    throw new PsdDecodeError('Could not inflate a ZIP-compressed channel')
  }

  const size = bytesPerSample(depth)
  const expected = width * height * size
  const plane = raw.length >= expected ? raw : padTo(raw, expected)

  if (compression === Compression.ZIP_PREDICTION) {
    undoPrediction(plane, width, height, depth)
  }

  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = sampleTo8Bit(plane, i * size, depth)
  }
  return out
}

/**
 * Reverse the horizontal delta prediction PSD applies before deflating.
 *
 * Each sample is stored as the difference from the sample to its left. The
 * addition is byte-wise with carry across each sample's bytes, in file order,
 * which is the same operation PSD applies for 8- and 16-bit channels.
 */
function undoPrediction(plane: Uint8Array, width: number, height: number, depth: number): void {
  const size = bytesPerSample(depth)

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
 */
export function decodePackBits(data: Uint8Array): Uint8Array {
  const out: number[] = []
  let i = 0

  while (i < data.length) {
    const control = data[i]!
    i += 1

    if (control < 128) {
      const count = control + 1
      for (let n = 0; n < count && i < data.length; n += 1) {
        out.push(data[i]!)
        i += 1
      }
    } else if (control > 128) {
      const count = 257 - control
      if (i < data.length) {
        const value = data[i]!
        i += 1
        for (let n = 0; n < count; n += 1) {
          out.push(value)
        }
      }
    }
  }

  return Uint8Array.from(out)
}
