/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { buildEditorUrl, createPhotoEditorFileAction, isEditableNode } from '../../src/fileActions'

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

describe('isEditableNode', () => {
  it('accepts a raster file', () => {
    expect(isEditableNode(node())).toBe(true)
  })

  it('accepts a PSD file', () => {
    expect(isEditableNode(node({ mime: 'image/vnd.adobe.photoshop', basename: 'art.psd' }))).toBe(true)
  })

  it('rejects a folder', () => {
    expect(isEditableNode(node({ type: 'folder' }))).toBe(false)
  })

  it('falls back to the extension when the mime is generic', () => {
    expect(isEditableNode(node({ mime: 'application/octet-stream', basename: 'x.psd' }))).toBe(true)
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

describe('createPhotoEditorFileAction', () => {
  it('describes the action', () => {
    const action = createPhotoEditorFileAction({ translate })
    expect(action.id).toBe('photo-editor-open')
    expect(action.displayName({} as never)).toBe('Open with Photo Editor')
  })

  it('is enabled for a single supported file', () => {
    const action = createPhotoEditorFileAction({ translate })
    expect(action.enabled({ nodes: [node()] } as never)).toBe(true)
  })

  it('is disabled for several files', () => {
    const action = createPhotoEditorFileAction({ translate })
    expect(action.enabled({ nodes: [node(), node()] } as never)).toBe(false)
  })

  it('navigates to the editor on exec', async () => {
    const navigate = jest.fn()
    const action = createPhotoEditorFileAction({ translate, navigate })

    const result = await action.exec({ nodes: [node()] } as never)

    expect(result).toBeNull()
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('fileIds=42'))
  })

  it('returns false when the node has no file id', async () => {
    const navigate = jest.fn()
    const action = createPhotoEditorFileAction({ translate, navigate })
    const result = await action.exec({ nodes: [node({ fileid: undefined })] } as never)

    expect(result).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
