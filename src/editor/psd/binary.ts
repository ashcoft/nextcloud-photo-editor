/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * A bounds-checked cursor over a byte buffer.
 *
 * Every read advances the offset and throws when it would run past the end, so
 * a truncated or hostile PSD fails with a clear error instead of returning
 * garbage from a silent out-of-range read.
 */
export class ByteReader {
  private offset = 0

  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.offset
  }

  get length(): number {
    return this.bytes.length
  }

  get remaining(): number {
    return this.bytes.length - this.offset
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.bytes.length) {
      throw new RangeError(`Seek out of range: ${offset}`)
    }
    this.offset = offset
  }

  skip(count: number): void {
    this.require(count)
    this.offset += count
  }

  private require(count: number): void {
    if (count < 0 || this.offset + count > this.bytes.length) {
      throw new RangeError(
        `Unexpected end of data: need ${count} bytes at ${this.offset}, have ${this.remaining}`,
      )
    }
  }

  readUint8(): number {
    this.require(1)
    return this.bytes[this.offset++]!
  }

  readInt8(): number {
    const value = this.readUint8()
    return value > 127 ? value - 256 : value
  }

  readUint16(): number {
    this.require(2)
    const value = (this.bytes[this.offset]! << 8) | this.bytes[this.offset + 1]!
    this.offset += 2
    return value
  }

  readInt16(): number {
    const value = this.readUint16()
    return value > 0x7fff ? value - 0x10000 : value
  }

  readUint32(): number {
    this.require(4)
    const value =
      (this.bytes[this.offset]! << 24) |
      (this.bytes[this.offset + 1]! << 16) |
      (this.bytes[this.offset + 2]! << 8) |
      this.bytes[this.offset + 3]!
    this.offset += 4
    return value >>> 0
  }

  readInt32(): number {
    return this.readUint32() | 0
  }

  /** Read a 4-byte signature such as `8BIM` as ASCII. */
  readSignature(): string {
    this.require(4)
    const value = String.fromCharCode(
      this.bytes[this.offset]!,
      this.bytes[this.offset + 1]!,
      this.bytes[this.offset + 2]!,
      this.bytes[this.offset + 3]!,
    )
    this.offset += 4
    return value
  }

  /** Read `count` raw bytes as a subarray view (no copy). */
  readBytes(count: number): Uint8Array {
    this.require(count)
    const view = this.bytes.subarray(this.offset, this.offset + count)
    this.offset += count
    return view
  }

  /**
   * Read a Pascal string: a length byte followed by that many bytes, padded to
   * an even total length (including the length byte).
   */
  readPascalString(padTo = 2): string {
    const length = this.readUint8()
    const text = decodeLatin1(this.readBytes(length))
    const total = length + 1
    const padding = (padTo - (total % padTo)) % padTo
    if (padding > 0) {
      this.skip(padding)
    }
    return text
  }
}

/**
 * Decode bytes as Latin-1.
 *
 * PSD stores names in MacRoman or ASCII; Latin-1 maps every byte to a code
 * point, so no byte is lost and the result is at least stable for ASCII names.
 */
export function decodeLatin1(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]!)
  }
  return out
}

/**
 * Inflate raw deflate data.
 *
 * PSD layer channels compressed with ZIP use zlib-wrapped deflate; the browser
 * exposes an inflate through `DecompressionStream('deflate')`, which handles
 * the zlib header. Returns null when the platform has no decompressor or the
 * stream is not valid deflate.
 */
export async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') {
    return null
  }

  try {
    // Copy into a fresh buffer: the stream detaches the input it is given.
    const stream = new Blob([new Uint8Array(data)]).stream()
    const inflated = stream.pipeThrough(new DecompressionStream('deflate'))
    const buffer = await new Response(inflated).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}
