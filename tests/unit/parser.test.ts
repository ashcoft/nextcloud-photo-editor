/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { parsePsd, PsdParseError } from '../../src/editor/psd/parser'
import { buildPsd } from './psdFixture'

describe('parsePsd', () => {
  it('reads the header fields', () => {
    const bytes = buildPsd({ width: 4, height: 3 })
    const document = parsePsd(bytes)

    expect(document.header.signature).toBe('8BPS')
    expect(document.header.version).toBe(1)
    expect(document.header.width).toBe(4)
    expect(document.header.height).toBe(3)
    expect(document.header.depth).toBe(8)
    expect(document.header.colorMode).toBe(3)
  })

  it('reads layer records with names and bounds', () => {
    const bytes = buildPsd({
      width: 4,
      height: 4,
      layers: [
        {
          name: 'Background',
          top: 0,
          left: 0,
          bottom: 4,
          right: 4,
          channels: {
            r: new Array(16).fill(10),
            g: new Array(16).fill(20),
            b: new Array(16).fill(30),
            a: new Array(16).fill(255),
          },
        },
        {
          name: 'Accent',
          top: 1,
          left: 1,
          bottom: 3,
          right: 3,
          opacity: 128,
          channels: {
            r: new Array(4).fill(200),
            g: new Array(4).fill(100),
            b: new Array(4).fill(50),
            a: new Array(4).fill(255),
          },
        },
      ],
    })

    const document = parsePsd(bytes)
    expect(document.layers).toHaveLength(2)

    // The tree is top-to-bottom, so "Accent" (drawn last) comes first.
    const [accent, background] = document.layers
    expect(accent!.name).toBe('Accent')
    expect(accent!.opacity).toBe(128)
    // Every bound, so a regression in any one of them is caught.
    expect(accent!.top).toBe(1)
    expect(accent!.left).toBe(1)
    expect(accent!.bottom).toBe(3)
    expect(accent!.right).toBe(3)
    expect(background!.name).toBe('Background')
    expect(background!.visible).toBe(true)
    expect(background!.top).toBe(0)
    expect(background!.left).toBe(0)
    expect(background!.bottom).toBe(4)
    expect(background!.right).toBe(4)
  })

  it('captures the merged image data section', () => {
    const merged = {
      r: new Array(4).fill(1),
      g: new Array(4).fill(2),
      b: new Array(4).fill(3),
    }
    const bytes = buildPsd({ width: 2, height: 2, merged })
    const document = parsePsd(bytes)

    // 2-byte compression tag + 3 planes of 4 bytes.
    expect(document.imageData.length).toBe(2 + 12)

    // The tag and the planes themselves, so a channel-order or offset
    // regression cannot pass on the length alone.
    expect(Array.from(document.imageData.subarray(0, 2))).toEqual([0, 0])
    const body = document.imageData.subarray(2)
    expect(Array.from(body.subarray(0, 4))).toEqual([1, 1, 1, 1])
    expect(Array.from(body.subarray(4, 8))).toEqual([2, 2, 2, 2])
    expect(Array.from(body.subarray(8, 12))).toEqual([3, 3, 3, 3])
  })

  it('records hidden layers', () => {
    const bytes = buildPsd({
      width: 2,
      height: 2,
      layers: [
        {
          name: 'Hidden',
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
          visible: false,
        },
      ],
    })

    const document = parsePsd(bytes)
    expect(document.layers[0]!.visible).toBe(false)
  })

  it('rejects a file that is not a PSD', () => {
    const bytes = Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    expect(() => parsePsd(bytes)).toThrow(PsdParseError)
  })

  it('rejects an unsupported version', () => {
    const bytes = buildPsd({ width: 2, height: 2 })
    bytes[5] = 3 // version bytes are at offsets 4-5
    expect(() => parsePsd(bytes)).toThrow(/version/i)
  })

  it('rejects zero dimensions', () => {
    const bytes = buildPsd({ width: 1, height: 1 })
    // Width occupies bytes 18..21, height 14..17; zero the height.
    bytes.fill(0, 14, 18)
    expect(() => parsePsd(bytes)).toThrow(/dimensions/i)
  })
})
