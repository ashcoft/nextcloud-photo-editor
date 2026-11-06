import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The editor fills the Nextcloud content area without overflowing it.
 *
 * Nextcloud puts a fixed header at the top of the page and renders app content
 * below it. A full-page app that sizes itself with `height: 100vh` overflows by
 * the header's height, so the bottom of the editor ends up off-screen behind a
 * scrollbar. The app's stylesheet therefore subtracts the header height.
 *
 * This loads the real stylesheet in a browser and checks the resulting box
 * against the content area, rather than restating the rule.
 */
const css = readFileSync(resolve(__dirname, '../../css/photo-editor.css'), 'utf8')

/**
 * The wrapper rules live in App.vue's scoped block, so the test reads them from
 * the component rather than restating them: a copy would drift and would let
 * the overflow regress unnoticed.
 *
 * `scoped` adds a data-v attribute; the rules are injected verbatim here, which
 * is equivalent for these selectors because the fixture uses the same class
 * names and no other element competes for them.
 */
function appScopedStyles(): string {
  const app = readFileSync(resolve(__dirname, '../../src/App.vue'), 'utf8')
  const match = app.match(/<style scoped>([\s\S]*?)<\/style>/)
  if (!match) {
    throw new Error('App.vue has no <style scoped> block')
  }

  return match[1]
}

const HEADER = 50
const VIEWPORT = 800

function fixture(): string {
  return `<!doctype html><html><head>
    <style>:root { --header-height: ${HEADER}px; }</style>
    <style>${css}</style>
    <style>${appScopedStyles()}</style>
  </head>
  <body style="margin:0">
    <header id="header" style="position:fixed;top:0;left:0;right:0;height:${HEADER}px"></header>
    <div id="content" style="margin-top:${HEADER}px;position:relative">
      <div id="photo-editor-container">
        <div id="photo-editor-wrapper" class="photo-editor-wrapper">
          <div class="photo-editor-toolbar">toolbar</div>
          <div class="photo-editor-body"></div>
        </div>
      </div>
    </div>
  </body></html>`
}

test.use({ viewport: { width: 1024, height: VIEWPORT } })

test('the editor fills the content area without overflowing it', async ({ page }) => {
  await page.setContent(fixture())

  const container = await page.locator('#photo-editor-container').boundingBox()

  expect(container).not.toBeNull()
  // The container starts below the header...
  expect(container!.y).toBeCloseTo(HEADER, 0)
  // ...and ends at the bottom of the viewport, not past it.
  expect(container!.y + container!.height).toBeLessThanOrEqual(VIEWPORT + 1)
  // It fills the space it was given rather than collapsing.
  expect(container!.height).toBeGreaterThan(VIEWPORT - HEADER - 2)
})

test('the wrapper fills the container rather than the viewport', async ({ page }) => {
  await page.setContent(fixture())

  const wrapper = await page.locator('#photo-editor-wrapper').boundingBox()
  const container = await page.locator('#photo-editor-container').boundingBox()

  expect(wrapper).not.toBeNull()
  expect(container).not.toBeNull()
  expect(wrapper!.height).toBeCloseTo(container!.height, 0)
})

test('the toolbar stays above the canvas so its buttons are clickable', async ({ page }) => {
  await page.setContent(fixture())

  const toolbar = await page.locator('.photo-editor-toolbar').boundingBox()

  expect(toolbar).not.toBeNull()
  // The toolbar is laid out first, so it keeps the top of the wrapper.
  expect(toolbar!.y).toBeCloseTo(HEADER, 0)
  expect(toolbar!.height).toBeGreaterThan(0)
})
