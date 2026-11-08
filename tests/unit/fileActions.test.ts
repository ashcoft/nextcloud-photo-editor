/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import {
  buildEditorUrl,
  createPhotoEditorFileActions,
  isEditableNode,
  isPsdNode,
  isRasterNode,
} from '../../src/fileActions'
import { DefaultType } from '@nextcloud/files'

const translate = (_app: string, text: string) => text

function node(overrides: Record<string, unknown> = {}) {
  return {
    type: 'file',
    mime: 'image/png',
    basename: 'photo.png',
    fileid: 42,
    ...overrides,
  } as never
}

function psdNode() {
  return node({ mime: 'image/vnd.adobe.photoshop', basename: 'art.psd' })
}

describe('isPsdNode', () => {
  it('accepts a PSD file', () => {
    expect(isPsdNode(psdNode())).toBe(true)
  })

  it('rejects a raster file', () => {
    expect(isPsdNode(node())).toBe(false)
  })

  it('rejects a folder', () => {
    expect(isPsdNode(node({ type: 'folder' }))).toBe(false)
  })

  it('falls back to the extension when the mime is generic', () => {
    expect(isPsdNode(node({ mime: 'application/octet-stream', basename: 'x.psb' }))).toBe(true)
  })
})

describe('isRasterNode', () => {
  it('accepts a raster file', () => {
    expect(isRasterNode(node())).toBe(true)
  })

  it('rejects a PSD file', () => {
    expect(isRasterNode(psdNode())).toBe(false)
  })

  it('rejects a folder named like an image', () => {
    expect(isRasterNode(node({ type: 'folder', basename: 'holiday.png' }))).toBe(false)
  })

  it('rejects an unsupported file', () => {
    expect(isRasterNode(node({ mime: 'text/plain', basename: 'notes.txt' }))).toBe(false)
  })
})

describe('isEditableNode', () => {
  it('accepts both kinds', () => {
    expect(isEditableNode(node())).toBe(true)
    expect(isEditableNode(psdNode())).toBe(true)
  })

  it('rejects an unsupported file', () => {
    expect(isEditableNode(node({ mime: 'text/plain', basename: 'notes.txt' }))).toBe(false)
  })
})

describe('buildEditorUrl', () => {
  it('points at the app viewer route with the file id', () => {
    expect(buildEditorUrl(7)).toContain('/apps/photo_editor/view?fileIds=7')
  })
})

describe('createPhotoEditorFileActions', () => {
  const actions = () => createPhotoEditorFileActions({ translate })
  const byId = (id: string) => actions().find((action) => action.id === id)!

  it('registers a Photoshop action and a raster action', () => {
    expect(actions().map((a) => a.id)).toEqual(['photo-editor-open-psd', 'photo-editor-open'])
  })

  it('makes only the Photoshop action the default', () => {
    // The default flag is what makes a single click open the editor, so a PSD
    // opens it and a raster image keeps Nextcloud's own viewer. Asserted
    // against the constant, not its value, so an upstream enum change does not
    // make this test lie.
    expect(byId('photo-editor-open-psd').default).toBe(DefaultType.DEFAULT)
    expect(byId('photo-editor-open').default).toBeUndefined()
  })

  it('names both actions the same in the menu', () => {
    expect(byId('photo-editor-open-psd').displayName({} as never)).toBe('Open with Photo Editor')
    expect(byId('photo-editor-open').displayName({} as never)).toBe('Open with Photo Editor')
  })

  it('enables exactly one action per file', () => {
    const png = [node()]
    const psd = [psdNode()]

    expect(byId('photo-editor-open-psd').enabled!({ nodes: psd } as never)).toBe(true)
    expect(byId('photo-editor-open').enabled!({ nodes: psd } as never)).toBe(false)

    expect(byId('photo-editor-open-psd').enabled!({ nodes: png } as never)).toBe(false)
    expect(byId('photo-editor-open').enabled!({ nodes: png } as never)).toBe(true)
  })

  it('disables both for several files', () => {
    const many = [node(), node()]
    expect(byId('photo-editor-open-psd').enabled!({ nodes: many } as never)).toBe(false)
    expect(byId('photo-editor-open').enabled!({ nodes: many } as never)).toBe(false)
  })

  it('navigates to the editor on exec', async () => {
    const navigate = jest.fn()
    const action = createPhotoEditorFileActions({ translate, navigate })
      .find((a) => a.id === 'photo-editor-open')!

    const result = await action.exec({ nodes: [node()] } as never)

    expect(result).toBeNull()
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('fileIds=42'))
  })

  it('returns false when the node has no file id', async () => {
    const navigate = jest.fn()
    const action = createPhotoEditorFileActions({ translate, navigate })
      .find((a) => a.id === 'photo-editor-open-psd')!

    const result = await action.exec({ nodes: [node({ fileid: undefined })] } as never)

    expect(result).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
