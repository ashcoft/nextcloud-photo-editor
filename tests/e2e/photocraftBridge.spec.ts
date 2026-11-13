import { test, expect, type Page, type Route } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildPsd } from '../unit/psdFixture'

/**
 * End-to-end coverage for the embedded PhotoCraft editor.
 *
 * The bridge reaches into the editor through interfaces PhotoCraft does not
 * promise to keep: it opens a file with an HTML5 drop, and it emits a save as a
 * blob-backed download. This test drives the real bridge against the real
 * vendored bundle in a browser, so a PhotoCraft upgrade that changes either
 * interface fails here rather than silently breaking Save in production.
 *
 * PhotoCraft needs a GPU API; CI has none, so the run forces Chromium's
 * software rasteriser (SwiftShader). The app then renders on its CPU path,
 * which is slower but exercises the same drop and save code.
 *
 * The Nextcloud runtime is not available in CI, so the page stubs the pieces
 * the built bundle touches and routes the file API, exactly as
 * `fileAction.spec.ts` does for the file action.
 */

const bundlePath = resolve(__dirname, '../../js/photo-editor.js')
const photocraftDir = resolve(__dirname, '../../photocraft')

/** The editor needs WebGL; CI has no GPU, so use the software rasteriser. */
test.use({
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  },
})

/**
 * A small, structurally valid Photoshop document with a merged image.
 *
 * Reused from the unit-test fixture so the e2e run exercises the same real
 * bytes the parser tests do, rather than a second hand-rolled document.
 */
function psdFixture(): Buffer {
  const width = 8
  const height = 8
  const plane = new Array(width * height).fill(255)
  const bytes = buildPsd({
    width,
    height,
    merged: { r: plane, g: new Array(width * height).fill(0), b: plane },
  })
  return Buffer.from(bytes)
}

/**
 * The image the file API hands back: a solid magenta PNG.
 *
 * It is generated in the browser with the canvas encoder rather than committed
 * as base64, so the bytes are certainly a valid PNG and the colour is exactly
 * the one the pixel assertion looks for.
 */
async function magentaPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff00ff'
    context.fillRect(0, 0, 128, 128)
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    const buffer = await blob.arrayBuffer()
    let binary = ''
    for (const byte of new Uint8Array(buffer)) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  })
  return Buffer.from(base64, 'base64')
}

/**
 * Count magenta pixels in a PNG screenshot.
 *
 * The loaded document is proved by its pixels because the editor ignores the
 * window-title command egui sends, so the title cannot report the file name.
 *
 * The PNG is decoded by the browser rather than by scanning the compressed
 * bytes: a flat fill still compresses into a stream whose byte runs do not
 * line up with pixel colour channels, so a raw scan is unreliable.
 */
async function countMagenta(page: Page, png: Buffer): Promise<number> {
  const base64 = png.toString('base64')
  return page.evaluate(async (data: string) => {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('screenshot did not decode'))
      image.src = `data:image/png;base64,${data}`
    })

    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height)

    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 180 && pixels[i + 1] < 80 && pixels[i + 2] > 180) {
        count++
      }
    }
    return count
  }, base64)
}

/**
 * Content type per extension, mirroring the app's bundle controller.
 *
 * `.wasm` has to be `application/wasm`; the gzip parts keep their bytes and
 * must not be labelled, or the page inflates them twice.
 */
function contentTypeFor(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  switch (extension) {
    case 'html': return 'text/html; charset=utf-8'
    case 'js': return 'text/javascript; charset=utf-8'
    case 'wasm': return 'application/wasm'
    case 'txt': return 'text/plain; charset=utf-8'
    default: return 'application/octet-stream'
  }
}

/**
 * Serve the vendored bundle under the app's own route, so the iframe's relative
 * subresource URLs resolve here exactly as they would in Nextcloud.
 *
 * `generateUrl` produces a path that includes `index.php` (Nextcloud's front
 * controller), so the pattern matches any prefix before the bundle path.
 */
async function serveBundle(page: Page): Promise<void> {
  await page.route('**/photocraft/**', (route: Route) => {
    const url = new URL(route.request().url())
    const marker = '/photocraft/'
    const index = url.pathname.indexOf(marker)
    const relative = index === -1 ? '' : decodeURIComponent(url.pathname.slice(index + marker.length))
    const file = relative === '' ? 'index.html' : relative
    const absolute = resolve(photocraftDir, file)

    // Keep the read inside the bundle directory.
    if (!absolute.startsWith(photocraftDir) || !existsSync(absolute)) {
      return route.fulfill({ status: 404, body: 'not found' })
    }

    return route.fulfill({
      status: 200,
      contentType: contentTypeFor(file),
      body: readFileSync(absolute),
    })
  })
}

/** Install the Nextcloud stubs and serve the built app bundle. */
async function loadApp(page: Page, options: { psd?: boolean } = {}): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.OC = { PERMISSION_READ: 1 }
    w.OCA = {}
    w.t = (_app: string, text: string) => text
    w.n = (_app: string, singular: string) => singular
    w._nc_files_scope = {
      v4_0: {
        fileActions: new Map(),
        registry: { dispatchTypedEvent: () => {} },
      },
    }
  })

  // The bytes the file API hands back. Built on a blank page first, because
  // the fixture needs a document to run a canvas in, and the routes below have
  // to be registered before the app navigates.
  await page.goto('about:blank')
  const imageBytes = options.psd ? psdFixture() : await magentaPng(page)

  const meta = options.psd
    ? {
        id: 7,
        name: 'art.psd',
        size: imageBytes.length,
        mimeType: 'image/vnd.adobe.photoshop',
        path: '/photos/art.psd',
        directory: '/photos',
        etag: 'etag-1',
        canSave: true,
        isPsd: true,
        url: '/apps/photo_editor/api/download/7',
        theme: 'light',
        contentType: 'image/vnd.adobe.photoshop',
        maxFileSize: 52428800,
      }
    : {
        id: 7,
        name: 'holiday.png',
        size: imageBytes.length,
        mimeType: 'image/png',
        path: '/photos/holiday.png',
        directory: '/photos',
        etag: 'etag-1',
        canSave: true,
        isPsd: false,
        url: '/apps/photo_editor/api/download/7',
        theme: 'light',
        contentType: 'image/png',
        maxFileSize: 52428800,
      }

  await page.route('**/api/load/*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(meta),
    }))

  await page.route('**/api/download/*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: imageBytes,
    }))

  await page.route('**/api/save/*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ etag: 'etag-2', size: 2048, mtime: 1 }),
    }))

  await serveBundle(page)

  await page.route('**/photo-editor.js', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: readFileSync(bundlePath, 'utf8'),
    }))

  // The app's Vue components are lazy chunks, fetched on demand. They are part
  // of the built bundle, so serve them from js/ as well.
  await page.route('**/apps/photo_editor/js/*.js', (route: Route) => {
    const name = route.request().url().split('/').pop() ?? ''
    const absolute = resolve(__dirname, '../../js', name)
    if (!existsSync(absolute)) {
      return route.fulfill({ status: 404, body: 'not found' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: readFileSync(absolute, 'utf8'),
    })
  })

  // The page itself. Registered last so it takes precedence, and it must not
  // swallow the bundle: the iframe's document URL also lives under
  // /apps/photo_editor/, so a photocraft request is left to the route above.
  await page.route('**/apps/photo_editor/**', (route: Route) => {
    const url = route.request().url()
    if (url.includes('/photocraft/') || route.request().resourceType() !== 'document') {
      return route.fallback()
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body></body></html>',
    })
  })

  await page.goto('/apps/photo_editor/')
  await page.evaluate(() => {
    const container = document.createElement('div')
    container.id = 'photo-editor-container'
    container.dataset.fileIds = '7'
    document.body.appendChild(container)
  })
  await page.addScriptTag({ url: '/apps/photo_editor/js/photo-editor.js' })
}

test.describe('embedded PhotoCraft editor', () => {
  test('opens the file and renders it in the editor', async ({ page }) => {
    test.setTimeout(180_000)
    await loadApp(page)

    // The editor reports ready only after the WASM app boots and the file is
    // handed over, so this waits on the app's own signal.
    const frame = page.frameLocator('iframe.photo-editor-frame')
    await expect(frame.locator('#photocraft_canvas')).toBeVisible({ timeout: 150_000 })

    // The app ignores egui's window-title command, so the loaded document is
    // proved by its pixels: the fixture is solid magenta, and a blank editor
    // shows none of it. Waiting for the count to rise is the load signal.
    await expect
      .poll(
        async () => countMagenta(page, await frame.locator('#photocraft_canvas').screenshot()),
        { timeout: 60_000, intervals: [1_000] },
      )
      .toBeGreaterThan(1_000)
  })

  test('writes a Photoshop document back when the editor saves it', async ({ page }) => {
    test.setTimeout(180_000)
    await loadApp(page, { psd: true })

    const frame = page.frameLocator('iframe.photo-editor-frame')
    await expect(frame.locator('#photocraft_canvas')).toBeVisible({ timeout: 150_000 })

    // Registered before the action, or the request can complete first and the
    // wait times out.
    const request = page.waitForRequest((r) =>
      r.url().includes('/apps/photo_editor/api/save/') && r.method() === 'POST')

    // Trigger the editor's own Save. The bridge turns the download into the
    // host's output, which is written back because the target is a PSD.
    await frame.locator('body').click({ position: { x: 400, y: 300 } })
    await page.keyboard.press('Control+s')

    const body = await request.then((r) => r.postData() ?? '')

    // The payload is a data URL of a Photoshop document: PhotoCraft saves a
    // layered PSD, and the server accepts it by its own signature.
    expect(body).toContain('data:image/vnd.adobe.photoshop;base64,')
    expect(body).toContain('etag-1')
  })

  test('writes a PNG back when a PNG is saved', async ({ page }) => {
    test.setTimeout(180_000)
    await loadApp(page)

    const frame = page.frameLocator('iframe.photo-editor-frame')
    await expect(frame.locator('#photocraft_canvas')).toBeVisible({ timeout: 150_000 })

    // Registered before the action, or the request can complete first and the
    // wait times out.
    const request = page.waitForRequest((r) =>
      r.url().includes('/apps/photo_editor/api/save/') && r.method() === 'POST')

    // PhotoCraft's Save emits a Photoshop document; the host re-encodes it as a
    // PNG for the `.png` target and posts that, rather than letting the browser
    // download it to the user's computer.
    await frame.locator('body').click({ position: { x: 400, y: 300 } })
    await page.keyboard.press('Control+s')

    const body = await request.then((r) => r.postData() ?? '')

    expect(body).toContain('data:image/png;base64,')
    expect(body).toContain('etag-1')
  })

  test('uploads a preview for a Photoshop document', async ({ page }) => {
    test.setTimeout(180_000)
    await loadApp(page, { psd: true })

    // Registered before the page loads, so the upload cannot be missed.
    const upload = page.waitForRequest((r) =>
      r.url().includes('/apps/photo_editor/api/thumbnail/') && r.method() === 'POST')

    // A PSD has no server-side previewer, so the app renders one from the
    // bytes it loaded and uploads it. Without this the Files grid would fall
    // back to the generic icon, which is the regression this guards.
    const body = await upload.then((r) => r.postData() ?? '')

    expect(body).toContain('data:image/png;base64,')
    expect(body).toContain('etag-1')
  })
})
