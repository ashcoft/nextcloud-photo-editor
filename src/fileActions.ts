/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { generateUrl } from '@nextcloud/router'
import { DefaultType, FileType, type IFileAction, type INode } from '@nextcloud/files'
import { isPsdExtension, isPsdMime, isRasterExtension, isRasterMime } from './editor/mimeTypes'

type TranslateFn = (app: string, text: string) => string

/** Inline image icon used for the file action. */
export const PHOTO_EDITOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm2.5 10 2.5-3 1.75 2.1L13.5 12l3.5 4.5h-11L7.5 15zM9 9.5A1.5 1.5 0 1 0 9 6.5a1.5 1.5 0 0 0 0 3z"/>
</svg>`

/**
 * Whether a node is a Photoshop document the editor can open.
 *
 * Only files are considered, so a folder named `holiday.psd` never matches.
 * The extension fallback keeps files openable when their MIME type has not
 * been resolved yet (e.g. the Nextcloud MIME mapping was not refreshed after
 * upload).
 */
export function isPsdNode(node: Pick<INode, 'type' | 'mime' | 'basename'>): boolean {
  if (node.type !== FileType.File) {
    return false
  }
  return isPsdMime(node.mime) || isPsdExtension(node.basename)
}

/**
 * Whether a node is a raster image the editor can open.
 */
export function isRasterNode(node: Pick<INode, 'type' | 'mime' | 'basename'>): boolean {
  if (node.type !== FileType.File) {
    return false
  }
  return isRasterMime(node.mime) || isRasterExtension(node.basename)
}

/**
 * Whether a node is an image the editor can open at all.
 */
export function isEditableNode(node: Pick<INode, 'type' | 'mime' | 'basename'>): boolean {
  return isPsdNode(node) || isRasterNode(node)
}

/**
 * Build the URL of the app's own full-page editor for a file id.
 */
export function buildEditorUrl(fileId: number | string): string {
  return `${generateUrl('/apps/photo_editor/view')}?fileIds=${encodeURIComponent(String(fileId))}`
}

interface ActionOptions {
  translate: TranslateFn
  iconSvgInline?: string
  navigate?: (url: string) => void
}

function defaultNavigate(url: string): void {
  window.location.href = url
}

/**
 * The shared body of both actions: one file, navigated to the editor route.
 */
function createAction(
  id: string,
  isEnabled: (node: Pick<INode, 'type' | 'mime' | 'basename'>) => boolean,
  isDefault: boolean,
  { translate, iconSvgInline = PHOTO_EDITOR_ICON, navigate = defaultNavigate }: ActionOptions,
): IFileAction {
  return {
    id,
    displayName: () => translate('photo_editor', 'Open with Photo Editor'),
    iconSvgInline: () => iconSvgInline,
    // Only the Photoshop action is the default, so a PSD opens the editor on a
    // single click. A raster image keeps Nextcloud's own viewer as the default
    // and reaches the editor through the actions menu, which is where a
    // right-click "Open with" lives.
    default: isDefault ? DefaultType.DEFAULT : undefined,
    enabled: ({ nodes }) => nodes.length === 1 && isEnabled(nodes[0]),
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

/**
 * Create the file actions that open a file in the editor.
 *
 * Two actions are registered rather than one with a computed default: the
 * `default` flag is a static property of the action, not a decision made per
 * file, so a single action cannot be the default for a PSD and a menu entry
 * for a PNG. Their predicates are disjoint, so exactly one applies to a file.
 */
export function createPhotoEditorFileActions(options: ActionOptions): IFileAction[] {
  return [
    createAction('photo-editor-open-psd', isPsdNode, true, options),
    createAction('photo-editor-open', isRasterNode, false, options),
  ]
}
