/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Regression tests for the findings fixed during review. Each one fails
 * against the behaviour that was reported.
 */

import { decodeChannel, Compression, undoPrediction } from '../../src/editor/psd/decode'
import { parsePsd } from '../../src/editor/psd/parser'
import { buildPsd } from './psdFixture'

/** Build a channel body: a 2-byte compression tag followed by raw bytes. */
function channel(compression: number, body: number[]): Uint8Array {
  return Uint8Array.from([(compression >> 8) & 0xff, compression & 0xff, ...body])
}

describe('blend mode keys', () => {
  it('maps the four-byte keys that carry a trailing space', () => {
    // `mul ` is multiply; reading the key trimmed would fall back to normal.
    const bytes = buildPsd({
      width: 1,
      height: 1,
      layers: [{ name: 'M', top: 0, left: 0, bottom: 1, right: 1, blendKey: 'mul ' }],
    })

    expect(parsePsd(bytes).layers[0]!.blendMode).toBe(1)
  })

  it('maps the mixed-case keys', () => {
    // `hLit` is hard light; `hlit` is not a key at all.
    const bytes = buildPsd({
      width: 1,
      height: 1,
      layers: [{ name: 'H', top: 0, left: 0, bottom: 1, right: 1, blendKey: 'hLit' }],
    })

    expect(parsePsd(bytes).layers[0]!.blendMode).toBe(8)
  })

  it('still maps a plain key', () => {
    const bytes = buildPsd({
      width: 1,
      height: 1,
      layers: [{ name: 'N', top: 0, left: 0, bottom: 1, right: 1, blendKey: 'scrn' }],
    })

    expect(parsePsd(bytes).layers[0]!.blendMode).toBe(2)
  })
})

describe('document size budget', () => {
  it('rejects a canvas larger than the render budget', () => {
    // A tiny file declaring an enormous canvas must not reach the compositor.
    const bytes = buildPsd({ width: 1, height: 1 })
    // Width is at bytes 18..21, height at 14..17; set a huge width.
    const huge = 0x7fffffff
    bytes[18] = (huge >>> 24) & 0xff
    bytes[19] = (huge >>> 16) & 0xff
    bytes[20] = (huge >>> 8) & 0xff
    bytes[21] = huge & 0xff

    expect(() => parsePsd(bytes)).toThrow(/too large/i)
  })
})

describe('compressed 1-bit channels', () => {
  it('unpacks a compressed row instead of reading a byte per pixel', () => {
    // One row of 8 pixels, RLE-encoded as a literal run of one packed byte.
    // 0b10100000 is pixels 1,0,1,0,0,0,0,0 -> 255,0,255,0,0,0,0,0.
    const body = [0x00, 0x02, 0x00, 0b10100000]

    return decodeChannel(channel(Compression.RLE, body), 8, 1, 1, false).then((plane) => {
      expect(Array.from(plane)).toEqual([255, 0, 255, 0, 0, 0, 0, 0])
    })
  })
})

describe('prediction', () => {
  it('keeps the carry inside a 16-bit sample', () => {
    // Two samples; the second's delta overflows its low byte, so the carry
    // must reach the high byte of the same sample.
    const plane = Uint8Array.from([
      0x00, 0xff, // sample 0 = 0x00ff
      0x00, 0x02, // delta low byte 2
    ])

    const decoded = undoPrediction(plane, 2, 1, 16)

    // 0x00ff + 0x0002 = 0x0101
    expect(Array.from(decoded)).toEqual([0x00, 0xff, 0x01, 0x01])
  })

  it('de-interleaves the byte planes of a 32-bit row', () => {
    // Two 32-bit samples stored as four byte planes. The delta runs across the
    // whole flattened row of eight bytes, so the running sum is
    // [1,1,3,3,6,6,10,10]; plane k is then bytes [k*2, k*2+1].
    const plane = Uint8Array.from([
      0x01, 0x00, // plane 0
      0x02, 0x00, // plane 1
      0x03, 0x00, // plane 2
      0x04, 0x00, // plane 3
    ])

    const decoded = undoPrediction(plane, 2, 1, 32)

    // Sample 0 gathers byte 0 of each plane; sample 1 gathers byte 1. Both
    // planes sum to the same values here because the deltas are zero.
    expect(Array.from(decoded)).toEqual([1, 3, 6, 10, 1, 3, 6, 10])
  })
})

describe('uncompressed 1-bit channels', () => {
  it('expands the packed bits, most significant first', async () => {
    const plane = await decodeChannel(channel(Compression.RAW, [0b11000000]), 8, 1, 1, false)
    expect(Array.from(plane)).toEqual([255, 255, 0, 0, 0, 0, 0, 0])
  })
})

describe('PackBits bounds', () => {
  it('stops expanding at the given limit', async () => {
    const { decodePackBits } = await import('../../src/editor/psd/decode')

    // A run control that asks for 128 copies, limited to 4.
    const out = decodePackBits(Uint8Array.from([0x81, 0x42]), 4)
    expect(out.length).toBe(4)
    expect(Array.from(out)).toEqual([0x42, 0x42, 0x42, 0x42])
  })
})
