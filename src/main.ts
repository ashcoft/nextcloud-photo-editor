/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { registerFileAction } from '@nextcloud/files'
import { translate as t } from '@nextcloud/l10n'
import { createPhotoEditorFileAction } from './fileActions'
import { mountEditorApp, mountStartPage } from './mount'

/**
 * Register the "Open with Photo Editor" file action.
 *
 * A single registration guarded by a try/catch: the script is an init script,
 * so this module is evaluated once per page, but registering twice would throw
 * "FileAction photo-editor-open already registered".
 */
function registerPhotoEditorFileAction(): void {
  try {
    registerFileAction(createPhotoEditorFileAction({ translate: t }))
  } catch {
    // The action is already registered; nothing else to do.
  }
}

function showMountError(container: HTMLElement): void {
  // Leave a visible message instead of a blank page with a silent rejection.
  container.textContent = t(
    'photo_editor',
    'Failed to load the Photo Editor. Please reload the page and try again.',
  )
}

/**
 * Mount the app component that matches the rendered template.
 *
 * The start page renders `#photo-editor-start`, the editor renders
 * `#photo-editor-container`. On the Files app neither exists and this is a
 * no-op.
 */
function mountStandaloneApp(): void {
  const startContainer = document.getElementById('photo-editor-start')
  if (startContainer) {
    mountStartPage(startContainer).catch((error: unknown) => {
      console.error('Photo Editor: failed to mount the start page', error)
      showMountError(startContainer)
    })
    return
  }

  const editorContainer = document.getElementById('photo-editor-container')
  if (!editorContainer) {
    return
  }

  mountEditorApp(editorContainer).catch((error: unknown) => {
    console.error('Photo Editor: failed to mount the editor', error)
    showMountError(editorContainer)
  })
}

function init(): void {
  registerPhotoEditorFileAction()
  mountStandaloneApp()
}

init()

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountStandaloneApp, { once: true })
}
