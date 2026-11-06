/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { generateUrl } from '@nextcloud/router'
import { DefaultType, FileType, type IFileAction, type INode } from '@nextcloud/files'
import { isSupportedExtension, isSupportedMime } from './editor/mimeTypes'

type TranslateFn = (app: string, text: string) => string

/** Inline image icon used for the file action. */
export const PHOTO_EDITOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm2.5 10 2.5-3 1.75 2.1L13.5 12l3.5 4.5h-11L7.5 15zM9 9.5A1.5 1.5 0 1 0 9 6.5a1.5 1.5 0 0 0 0 3z"/>
</svg>`

/**
 * Whether a node is an image the editor can open.
 *
 * Only files are considered, so a folder named `holiday.png` never matches.
 * The extension fallback keeps images openable when their MIME type has not
 * been resolved yet (e.g. the Nextcloud MIME mapping was not refreshed after
 * upload).
 */
export function isEditableNode(node: Pick<INode, 'type' | 'mime' | 'basename'>): boolean {
  if (node.type !== FileType.File) {
    return false
  }
  return isSupportedMime(node.mime) || isSupportedExtension(node.basename)
}

/**
 * Build the URL of the app's own full-page editor for a file id.
 */
export function buildEditorUrl(fileId: number | string): string {
  return `${generateUrl('/apps/photo_editor/view')}?fileIds=${encodeURIComponent(String(fileId))}`
}

/**
 * Create the "Open with Photo Editor" file action.
 *
 * The action is registered as the default for supported images, so a single
 * click opens the editor. It navigates to the app's own editor route, which
 * runs the Vue editor directly.
 */
export function createPhotoEditorFileAction({
  translate,
  iconSvgInline = PHOTO_EDITOR_ICON,
  navigate = (url: string) => {
    window.location.href = url
  },
}: {
  translate: TranslateFn
  iconSvgInline?: string
  navigate?: (url: string) => void
}): IFileAction {
  return {
    id: 'photo-editor-open',
    displayName: () => translate('photo_editor', 'Open with Photo Editor'),
    iconSvgInline: () => iconSvgInline,
    default: DefaultType.DEFAULT,
    enabled: ({ nodes }) => nodes.length === 1 && isEditableNode(nodes[0]),
    exec: async ({ nodes }) => {
      const node = nodes[0]
      if (node?.fileid === undefined) {
        return false
      }
      navigate(buildEditorUrl(node.fileid))
      return null
    },
  }
}
