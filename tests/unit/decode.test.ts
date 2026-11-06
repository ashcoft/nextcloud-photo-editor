/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { Compression, decodeChannel, decodePackBits } from '../../src/editor/psd/decode'

/** Build a channel body: a 2-byte compression tag followed by raw bytes. */
function channel(compression: number, body: number[]): Uint8Array {
  return Uint8Array.from([(compression >> 8) & 0xff, compression & 0xff, ...body])
}

describe('decodeChannel', () => {
  it('reads a raw 8-bit plane', async () => {
    const plane = await decodeChannel(channel(Compression.RAW, [10, 20, 30, 40]), 2, 2, 8, false)
    expect(Array.from(plane)).toEqual([10, 20, 30, 40])
  })

  it('reduces a 16-bit plane to its high byte', async () => {
    // Two 16-bit big-endian samples: 0x1234 and 0xABCD.
    const plane = await decodeChannel(
      channel(Compression.RAW, [0x12, 0x34, 0xab, 0xcd]),
      2,
      1,
      16,
      false,
    )
    expect(Array.from(plane)).toEqual([0x12, 0xab])
  })

  it('expands a raw 1-bit plane, most significant bit first', async () => {
    // 0b10100000 => pixels 1,0,1,0,0,0,0,0
    const plane = await decodeChannel(channel(Compression.RAW, [0b10100000]), 8, 1, 1, false)
    expect(Array.from(plane)).toEqual([255, 0, 255, 0, 0, 0, 0, 0])
  })

  it('decodes an RLE plane', async () => {
    // One row of 4 pixels. The 2-byte row count comes first and covers the
    // packed bytes (a literal run of 4), which then follow.
    const body = [0x00, 0x05, 0x03, 1, 2, 3, 4]
    const plane = await decodeChannel(channel(Compression.RLE, body), 4, 1, 8, false)
    expect(Array.from(plane)).toEqual([1, 2, 3, 4])
  })

  it('rejects an empty channel', async () => {
    await expect(decodeChannel(new Uint8Array(1), 4, 4, 8, false)).rejects.toThrow()
  })

  it('rejects an unsupported compression tag', async () => {
    await expect(decodeChannel(channel(99, [1, 2, 3]), 1, 1, 8, false)).rejects.toThrow()
  })

  it('returns an empty plane for a zero-sized channel', async () => {
    const plane = await decodeChannel(channel(Compression.RAW, []), 0, 0, 8, false)
    expect(plane.length).toBe(0)
  })
})

describe('decodePackBits', () => {
  it('copies literal runs', () => {
    // control 2 => copy the next 3 bytes.
    const out = decodePackBits(Uint8Array.from([0x02, 0xaa, 0xbb, 0xcc]))
    expect(Array.from(out)).toEqual([0xaa, 0xbb, 0xcc])
  })

  it('expands repeated runs', () => {
    // control 254 => repeat the next byte 257-254 = 3 times.
    const out = decodePackBits(Uint8Array.from([0xfe, 0x42]))
    expect(Array.from(out)).toEqual([0x42, 0x42, 0x42])
  })

  it('treats 128 as a no-op', () => {
    const out = decodePackBits(Uint8Array.from([0x80, 0x00, 0x41]))
    expect(Array.from(out)).toEqual([0x41])
  })

  it('handles a mixed stream', () => {
    const out = decodePackBits(
      Uint8Array.from([0x01, 0x11, 0x22, 0xfd, 0x99, 0x00, 0x33]),
    )
    expect(Array.from(out)).toEqual([0x11, 0x22, 0x99, 0x99, 0x99, 0x99, 0x33])
  })

  it('stops cleanly on a truncated run', () => {
    // A repeat control with no following byte produces nothing.
    const out = decodePackBits(Uint8Array.from([0xfe]))
    expect(Array.from(out)).toEqual([])
  })
})
