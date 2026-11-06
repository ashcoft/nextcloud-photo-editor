/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { readRecentImages, resolveFileId } from '../../src/mount'

function container(dataset: Record<string, string>): HTMLElement {
  const element = document.createElement('div')
  for (const [key, value] of Object.entries(dataset)) {
    element.dataset[key] = value
  }
  return element
}

describe('readRecentImages', () => {
  it('parses a valid list', () => {
    const element = container({
      recentImages: JSON.stringify([
        { id: 1, name: 'a.png', path: '/a.png', extension: 'png', mtime: 100, isPsd: false },
      ]),
    })

    const images = readRecentImages(element)
    expect(images).toHaveLength(1)
    expect(images[0]!.name).toBe('a.png')
  })

  it('returns an empty list when the attribute is absent', () => {
    expect(readRecentImages(container({}))).toEqual([])
  })

  it('returns an empty list when the JSON is malformed', () => {
    expect(readRecentImages(container({ recentImages: '{not json' }))).toEqual([])
  })

  it('returns an empty list when the value is not an array', () => {
    expect(readRecentImages(container({ recentImages: '{"a":1}' }))).toEqual([])
  })

  it('drops entries missing required fields', () => {
    const element = container({
      recentImages: JSON.stringify([
        { id: 1, name: 'a.png', path: '/a.png', extension: 'png', mtime: 100 },
        { id: 2, name: 'b.png' },
      ]),
    })

    expect(readRecentImages(element)).toHaveLength(1)
  })
})

describe('resolveFileId', () => {
  it('prefers the container attribute', () => {
    window.history.replaceState({}, '', '/?fileIds=99')
    expect(resolveFileId(container({ fileIds: '12' }))).toBe('12')
  })

  it('falls back to the query string', () => {
    window.history.replaceState({}, '', '/?fileIds=99')
    expect(resolveFileId(container({}))).toBe('99')
  })

  it('accepts the singular query parameter', () => {
    window.history.replaceState({}, '', '/?fileId=7')
    expect(resolveFileId(container({}))).toBe('7')
  })

  it('returns null when nothing is set', () => {
    window.history.replaceState({}, '', '/')
    expect(resolveFileId(container({}))).toBeNull()
  })
})
