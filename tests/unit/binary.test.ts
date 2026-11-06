/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { ByteReader, decodeLatin1 } from '../../src/editor/psd/binary'

describe('ByteReader', () => {
  it('reads big-endian integers', () => {
    const reader = new ByteReader(Uint8Array.from([0x12, 0x34, 0x56, 0x78]))
    expect(reader.readUint16()).toBe(0x1234)
    expect(reader.readUint16()).toBe(0x5678)
  })

  it('reads unsigned and signed 32-bit values', () => {
    const unsigned = new ByteReader(Uint8Array.from([0xff, 0xff, 0xff, 0xff]))
    expect(unsigned.readUint32()).toBe(0xffffffff)

    const signed = new ByteReader(Uint8Array.from([0xff, 0xff, 0xff, 0xfe]))
    expect(signed.readInt32()).toBe(-2)
  })

  it('reads signed 16-bit values', () => {
    const reader = new ByteReader(Uint8Array.from([0xff, 0xfe]))
    expect(reader.readInt16()).toBe(-2)
  })

  it('reads a 4-character signature', () => {
    const reader = new ByteReader(Uint8Array.from([0x38, 0x42, 0x50, 0x53]))
    expect(reader.readSignature()).toBe('8BPS')
  })

  it('reads a Pascal string with padding', () => {
    // length 3, "abc": 4 bytes total, which is already a multiple of 4.
    const reader = new ByteReader(Uint8Array.from([0x03, 0x61, 0x62, 0x63]))
    expect(reader.readPascalString(4)).toBe('abc')
    expect(reader.remaining).toBe(0)
  })

  it('pads a Pascal string to the requested boundary', () => {
    // length 2, "ab": 3 bytes total, padded to 4 with one zero byte.
    const reader = new ByteReader(Uint8Array.from([0x02, 0x61, 0x62, 0x00, 0xff]))
    expect(reader.readPascalString(4)).toBe('ab')
    expect(reader.remaining).toBe(1)
  })

  it('throws when reading past the end', () => {
    const reader = new ByteReader(Uint8Array.from([0x01]))
    expect(() => reader.readUint32()).toThrow(RangeError)
  })

  it('throws on an out-of-range seek', () => {
    const reader = new ByteReader(Uint8Array.from([0x01, 0x02]))
    expect(() => reader.seek(5)).toThrow(RangeError)
  })

  it('tracks position and remaining', () => {
    const reader = new ByteReader(Uint8Array.from([0x01, 0x02, 0x03]))
    expect(reader.remaining).toBe(3)
    reader.readUint8()
    expect(reader.position).toBe(1)
    expect(reader.remaining).toBe(2)
  })
})

describe('decodeLatin1', () => {
  it('maps every byte to a code point', () => {
    expect(decodeLatin1(Uint8Array.from([0x41, 0x42, 0xe9]))).toBe('ABé')
  })
})
