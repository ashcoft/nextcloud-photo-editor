import axios from '@nextcloud/axios'
import { translate as t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'

const APP_ID = 'photo_editor'

/**
 * Wire the admin settings form: post every field on Save and report the
 * outcome in the status region, so it is announced to screen readers too.
 *
 * Exported so tests can drive it against a rendered form.
 */
export function initSettingsForm(): void {
  const saveButton = document.getElementById('photo-editor-save')
  const status = document.getElementById('photo-editor-status')
  if (!(saveButton instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) {
    return
  }

  saveButton.addEventListener('click', async () => {
    const params = new URLSearchParams()
    for (const name of ['theme', 'previews']) {
      const select = document.getElementById(`photo-editor-${name}`)
      if (select instanceof HTMLSelectElement) {
        params.append(name, select.value)
      }
    }
    const maxSize = document.getElementById('photo-editor-max-size')
    if (maxSize instanceof HTMLInputElement) {
      params.append('maxSizeMb', maxSize.value)
    }

    saveButton.disabled = true
    status.textContent = ''

    try {
      await axios.post(generateUrl(`apps/${APP_ID}/settings/save`), params)
      status.textContent = t(APP_ID, 'Settings have been successfully saved')
    } catch (error) {
      status.textContent = t(APP_ID, 'Error when trying to save settings')
      // Log only the HTTP status: the axios error carries
      // config.headers.requesttoken, so it must never be logged whole.
      const httpStatus = (error as { response?: { status?: number } } | null)?.response?.status
      console.error('Photo Editor: failed to save settings', httpStatus ?? 'request failed')
    } finally {
      saveButton.disabled = false
    }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettingsForm, { once: true })
} else {
  initSettingsForm()
}
