/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { renderPsdThumbnail } from '../../src/editor/psdThumbnail'
import { buildPsd } from './psdFixture'

/**
 * The PSD reader is kept for one job after the editor became PhotoCraft: it
 * renders the Files-grid preview, because a Photoshop document has no
 * server-side previewer.
 *
 * jsdom has no canvas, so a successful render cannot be asserted here. What
 * these tests pin is the contract the caller depends on: a document that
 * cannot be rendered returns null rather than throwing, because a missing
 * thumbnail must never break opening the editor.
 */
describe('renderPsdThumbnail', () => {
  it('returns null for bytes that are not a Photoshop document', async () => {
    const notPsd = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(renderPsdThumbnail(notPsd)).resolves.toBeNull()
  })

  it('returns null for an empty buffer', async () => {
    await expect(renderPsdThumbnail(new Uint8Array())).resolves.toBeNull()
  })

  it('returns null for a truncated document rather than throwing', async () => {
    const truncated = new Uint8Array([0x38, 0x42, 0x50, 0x53, 0x00, 0x01])

    await expect(renderPsdThumbnail(truncated)).resolves.toBeNull()
  })

  it('returns null when the canvas cannot be drawn', async () => {
    // A structurally valid document: the failure this pins is the missing 2D
    // context in jsdom, which must surface as null, not as a rejection.
    const bytes = buildPsd({ width: 2, height: 2 })

    await expect(renderPsdThumbnail(bytes)).resolves.toBeNull()
  })
})
