/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { headerSummary, summarizeLayers } from '../../src/editor/psd/composite'
import type { PsdLayer } from '../../src/editor/psd/types'
import { ColorMode } from '../../src/editor/psd/types'

function layer(overrides: Partial<PsdLayer> = {}): PsdLayer {
  return {
    name: 'Layer',
    top: 0,
    left: 0,
    bottom: 10,
    right: 20,
    blendMode: 0,
    opacity: 255,
    visible: true,
    clipping: false,
    isGroup: false,
    sectionDivider: '',
    channels: [],
    channelData: new Map(),
    mask: null,
    children: [],
    ...overrides,
  }
}

describe('summarizeLayers', () => {
  it('describes a flat layer list', () => {
    const summary = summarizeLayers([
      layer({ name: 'Background' }),
      layer({ name: 'Accent', blendMode: 1, opacity: 128 }),
    ])

    expect(summary).toHaveLength(2)
    expect(summary[0]!.name).toBe('Background')
    expect(summary[0]!.depth).toBe(0)
    expect(summary[1]!.blendMode).toBe('multiply')
    expect(summary[1]!.opacity).toBe(128)
  })

  it('walks into groups and reports their depth', () => {
    const group = layer({
      name: 'Group',
      isGroup: true,
      children: [layer({ name: 'Inner' })],
    })

    const summary = summarizeLayers([group])

    expect(summary).toHaveLength(2)
    expect(summary[0]!.isGroup).toBe(true)
    expect(summary[0]!.depth).toBe(0)
    expect(summary[1]!.name).toBe('Inner')
    expect(summary[1]!.depth).toBe(1)
  })

  it('computes each layer size from its bounds', () => {
    const summary = summarizeLayers([layer({ top: 2, left: 3, bottom: 12, right: 23 })])
    expect(summary[0]!.width).toBe(20)
    expect(summary[0]!.height).toBe(10)
  })

  it('assigns a unique id to every entry', () => {
    const summary = summarizeLayers([
      layer({ name: 'A', children: [] }),
      layer({ name: 'B' }),
    ])

    const ids = summary.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never reports a negative size', () => {
    const summary = summarizeLayers([layer({ top: 10, bottom: 0, left: 10, right: 0 })])
    expect(summary[0]!.width).toBe(0)
    expect(summary[0]!.height).toBe(0)
  })
})

describe('headerSummary', () => {
  it('describes an RGB PSD', () => {
    const summary = headerSummary({
      signature: '8BPS',
      version: 1,
      channels: 3,
      height: 100,
      width: 200,
      depth: 8,
      colorMode: ColorMode.RGB,
    })

    expect(summary).toBe('PSD · 200×100 · RGB · 8-bit')
  })

  it('describes a large grayscale PSB', () => {
    const summary = headerSummary({
      signature: '8BPS',
      version: 2,
      channels: 1,
      height: 10,
      width: 10,
      depth: 16,
      colorMode: ColorMode.GRAYSCALE,
    })

    expect(summary).toContain('PSB')
    expect(summary).toContain('Grayscale')
    expect(summary).toContain('16-bit')
  })

  it('labels an unknown colour mode rather than failing', () => {
    const summary = headerSummary({
      signature: '8BPS',
      version: 1,
      channels: 3,
      height: 1,
      width: 1,
      depth: 8,
      colorMode: 99,
    })

    expect(summary).toContain('Unknown')
  })
})
