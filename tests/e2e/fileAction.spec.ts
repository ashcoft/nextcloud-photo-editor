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

test('registers the file actions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await loadInitScript(page)

  const ids = await page.evaluate(() => {
    const actions = (
      window as unknown as {
        _nc_files_scope: { v4_0: { fileActions: Map<string, unknown> } }
      }
    )._nc_files_scope.v4_0.fileActions
    return [...actions.keys()]
  })

  expect(ids).toContain('photo-editor-open-psd')
  expect(ids).toContain('photo-editor-open')
  expect(errors).toEqual([])
})

test('only the Photoshop action is the default', async ({ page }) => {
  await loadInitScript(page)

  const defaults = await page.evaluate(() => {
    const scope = (window as unknown as { _nc_files_scope: { v4_0: { fileActions: Map<string, { default?: unknown }> } } })
      ._nc_files_scope
    return {
      psd: scope.v4_0.fileActions.get('photo-editor-open-psd')?.default ?? null,
      raster: scope.v4_0.fileActions.get('photo-editor-open')?.default ?? null,
    }
  })

  // The default is what a single click runs: a PSD opens the editor, and a
  // raster image keeps Nextcloud's own viewer and reaches the editor through
  // the actions menu. Asserted against the concrete value rather than "not
  // null", so a `HIDDEN` default could not pass.
  expect(defaults.psd).toBe('default')
  expect(defaults.raster).toBeNull()
})

test('each action applies to exactly one kind of file', async ({ page }) => {
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

    const file = (mime: string, basename: string) => ({ type: 'file', mime, basename })
    const folder = { type: 'folder', mime: 'httpd/unix-directory', basename: 'photo.png' }
    const cases = {
      png: file('image/png', 'photo.png'),
      psd: file('image/vnd.adobe.photoshop', 'art.psd'),
      octet: file('application/octet-stream', 'art.psd'),
      pdf: file('application/pdf', 'notes.pdf'),
      folder,
      // The name and the MIME type disagree, which is what Nextcloud reports
      // while a type mapping is stale.
      pngNamedPsd: file('image/png', 'art.psd'),
      psdNamedPng: file('image/vnd.adobe.photoshop', 'photo.png'),
    }

    const out: Record<string, Record<string, boolean | undefined>> = {}
    for (const [name, node] of Object.entries(cases)) {
      out[name] = {
        psd: actions.get('photo-editor-open-psd')?.enabled?.({ nodes: [node] }),
        raster: actions.get('photo-editor-open')?.enabled?.({ nodes: [node] }),
      }
    }
    return out
  })

  expect(results).toEqual({
    // A raster image is the raster action's, not the Photoshop action's.
    png: { psd: false, raster: true },
    psd: { psd: true, raster: false },
    // The extension fallback covers an unresolved MIME type.
    octet: { psd: true, raster: false },
    pdf: { psd: false, raster: false },
    folder: { psd: false, raster: false },
    // The MIME type decides, so the two actions stay mutually exclusive.
    pngNamedPsd: { psd: false, raster: true },
    psdNamedPng: { psd: true, raster: false },
  })
})
