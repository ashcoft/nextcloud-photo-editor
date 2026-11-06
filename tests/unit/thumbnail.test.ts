/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { renderThumbnail } from '../../src/utils/thumbnail'

/**
 * jsdom has no canvas implementation, so `getContext('2d')` returns null and
 * the renderer reports that it could not draw. That is exactly the guard the
 * function is supposed to have, so it is what these tests assert.
 */
describe('renderThumbnail', () => {
  it('returns null for an empty canvas', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 0
    canvas.height = 0
    expect(renderThumbnail(canvas)).toBeNull()
  })

  it('returns null when no 2D context is available', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 100
    canvas.height = 100
    expect(renderThumbnail(canvas)).toBeNull()
  })
})
