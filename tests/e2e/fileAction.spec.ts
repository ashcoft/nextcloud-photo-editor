import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * End-to-end coverage for the built init script (js/photo-editor.js).
 *
 * The script runs on the Files page and must register the "Open with Photo
 * Editor" file action, which is what makes a single click on an image or a PSD
 * open the app's editor.
 *
 * The Nextcloud Files runtime is not available in CI, so the page provides a
 * minimal stub of the pieces the script touches (@nextcloud/files registry,
 * @nextcloud/l10n and @nextcloud/router). The real bundle is loaded from a URL
 * (so its automatic public path resolves) and exercised in a browser.
 */

const bundlePath = resolve(__dirname, '../../js/photo-editor.js')

/** Install the Nextcloud stubs and serve the built bundle. */
async function loadInitScript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.OC = { PERMISSION_READ: 1 }
    w.OCA = {}
    w.t = (_app: string, text: string) => text
    w.n = (_app: string, singular: string) => singular

    // Minimal @nextcloud/files registry, exposed on the global scope the
    // bundle reads it from.
    w._nc_files_scope = {
      v4_0: {
        fileActions: new Map(),
        registry: { dispatchTypedEvent: () => {} },
      },
    }
  })

  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.endsWith('/photo-editor.js')) {
      return route.fulfill({
        contentType: 'application/javascript',
        body: readFileSync(bundlePath, 'utf8'),
      })
    }
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body></body></html>',
    })
  })

  await page.goto('/apps/photo_editor/')
  await page.addScriptTag({ url: '/apps/photo_editor/js/photo-editor.js' })
}

test('registers the "Open with Photo Editor" file action', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await loadInitScript(page)

  const action = await page.evaluate(() => {
    const actions = (
      window as unknown as {
        _nc_files_scope: { v4_0: { fileActions: Map<string, unknown> } }
      }
    )._nc_files_scope.v4_0.fileActions
    return actions.get('photo-editor-open') ?? null
  })

  expect(action).not.toBeNull()
  expect(errors).toEqual([])
})

test('the action is enabled only for supported images', async ({ page }) => {
  await loadInitScript(page)

  const results = await page.evaluate(() => {
    const actions = (
      window as unknown as {
        _nc_files_scope: {
          v4_0: {
            fileActions: Map<
              string,
              { enabled?: (context: { nodes: unknown[] }) => boolean }
            >
          }
        }
      }
    )._nc_files_scope.v4_0.fileActions
    const action = actions.get('photo-editor-open')
    if (!action?.enabled) {
      return null
    }

    const file = (mime: string, basename: string) => ({ type: 'file', mime, basename })
    return {
      png: action.enabled({ nodes: [file('image/png', 'photo.png')] }),
      psd: action.enabled({ nodes: [file('image/vnd.adobe.photoshop', 'art.psd')] }),
      octet: action.enabled({ nodes: [file('application/octet-stream', 'art.psd')] }),
      pdf: action.enabled({ nodes: [file('application/pdf', 'notes.pdf')] }),
      folder: action.enabled({ nodes: [{ type: 'folder', mime: 'httpd/unix-directory', basename: 'photo.png' }] }),
    }
  })

  expect(results).toEqual({ png: true, psd: true, octet: true, pdf: false, folder: false })
})
