/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { PhotocraftBridge } from '../../src/editor/photocraftBridge'

/**
 * The bridge reaches into a same-origin iframe. jsdom gives us a real one, but
 * it does not run the editor, so these tests drive the two interfaces the
 * bridge uses directly: the drop it dispatches, and the download it intercepts.
 *
 * What this cannot prove is that PhotoCraft still *honours* those interfaces -
 * that is what the Playwright test against the real bundle is for.
 */
function makeFrame(): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  if (doc === null) {
    throw new Error('jsdom did not provide a contentDocument')
  }

  // The bridge waits for this element and for the loading overlay to be gone.
  const canvas = doc.createElement('canvas')
  canvas.id = 'photocraft_canvas'
  doc.body.appendChild(canvas)

  return frame
}

/**
 * Give the iframe window the DOM APIs jsdom omits.
 *
 * jsdom implements neither the blob-URL API nor the drag-and-drop classes, so
 * the bridge has nothing to wrap or dispatch. Supplying the primitives a
 * browser always provides lets the bridge's own code run unchanged; these are
 * not stand-ins for the code under test.
 */
function shimDomApis(frame: HTMLIFrameElement): void {
  const window = frame.contentWindow as (Window & typeof globalThis) | null
  if (window === null) {
    throw new Error('no contentWindow')
  }

  const urls = new Map<string, Blob>()
  let next = 0

  Object.defineProperty(window.URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (object: Blob): string => {
      const url = `blob:jsdom/${next++}`
      urls.set(url, object)
      return url
    },
  })
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: (url: string): void => {
      urls.delete(url)
    },
  })

  // A minimal DataTransfer: enough for `items.add(file)` and `files`, which is
  // all the bridge and the drop listener read.
  class JsdomDataTransfer {
    readonly files: File[] = []
    readonly items = {
      add: (file: File): void => {
        this.files.push(file)
      },
    }
  }

  class JsdomDragEvent extends window.Event {
    readonly dataTransfer: JsdomDataTransfer | null

    constructor(type: string, init: { dataTransfer?: JsdomDataTransfer } = {}) {
      super(type, { bubbles: true, cancelable: true })
      this.dataTransfer = init.dataTransfer ?? null
    }
  }

  Object.defineProperty(window, 'DataTransfer', { configurable: true, writable: true, value: JsdomDataTransfer })
  Object.defineProperty(window, 'DragEvent', { configurable: true, writable: true, value: JsdomDragEvent })
}

describe('PhotocraftBridge', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves ready() once the drop target exists', async () => {
    const bridge = new PhotocraftBridge(makeFrame(), { shouldIntercept: () => true, onOutput: () => {} })
    await expect(bridge.ready()).resolves.toBeUndefined()
  })

  it('dispatches the three drag events that open a file', async () => {
    const frame = makeFrame()
    shimDomApis(frame)
    const bridge = new PhotocraftBridge(frame, { shouldIntercept: () => true, onOutput: () => {} })
    await bridge.ready()

    const seen: string[] = []
    frame.contentDocument!.addEventListener('drop', (event) => {
      seen.push(event.type)
      // A dropped file arrives on dataTransfer.files.
      expect((event as DragEvent).dataTransfer?.files.length).toBe(1)
    })
    frame.contentDocument!.addEventListener('dragover', (event) => seen.push(event.type))
    frame.contentDocument!.addEventListener('dragenter', (event) => seen.push(event.type))

    await bridge.open('photo.png', 'image/png', new Uint8Array([1, 2, 3]))

    expect(seen).toEqual(['dragenter', 'dragover', 'drop'])
  })

  it('hands a produced file to onOutput instead of downloading it', async () => {
    const frame = makeFrame()
    shimDomApis(frame)
    const outputs: { name: string; type: string; size: number }[] = []
    const bridge = new PhotocraftBridge(frame, {
      shouldIntercept: () => true,
      onOutput: (output) => outputs.push({ name: output.name, type: output.type, size: output.blob.size }),
    })
    await bridge.ready()
    bridge.install()

    const window = frame.contentWindow!
    // Exactly what the editor does: build a blob, object-URL it, click an
    // anchor that carries `download`.
    const blob = new window.Blob(['hello'], { type: 'image/vnd.adobe.photoshop' })
    const url = window.URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = 'art.psd'
    anchor.click()

    expect(outputs).toEqual([
      { name: 'art.psd', type: 'image/vnd.adobe.photoshop', size: 5 },
    ])
  })

  it('leaves a download that is not blob-backed alone', async () => {
    const frame = makeFrame()
    shimDomApis(frame)
    const outputs: unknown[] = []
    const bridge = new PhotocraftBridge(frame, {
      shouldIntercept: () => true,
      onOutput: (o) => outputs.push(o),
    })
    await bridge.ready()
    bridge.install()

    const window = frame.contentWindow!
    const anchor = window.document.createElement('a')
    anchor.href = 'https://example.com/file.txt'
    anchor.download = 'file.txt'

    // The patched click falls through to the original, which in jsdom is a
    // no-op, so nothing is captured and nothing throws.
    expect(() => anchor.click()).not.toThrow()
    expect(outputs).toEqual([])
  })

  it('lets the editor download a file the host will not store', async () => {
    const frame = makeFrame()
    shimDomApis(frame)
    const outputs: unknown[] = []
    const bridge = new PhotocraftBridge(frame, {
      // The host refuses, as it does for a Photoshop document produced for a
      // PNG target.
      shouldIntercept: () => false,
      onOutput: (o) => outputs.push(o),
    })
    await bridge.ready()
    bridge.install()

    const window = frame.contentWindow!
    const blob = new window.Blob(['psd'], { type: 'image/vnd.adobe.photoshop' })
    const url = window.URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = 'art.psd'

    // Nothing is captured, and the click falls through so the user still gets
    // the file. The original `click` is a no-op in jsdom, so a throw here would
    // mean the bridge swallowed it.
    expect(() => anchor.click()).not.toThrow()
    expect(outputs).toEqual([])
  })
})
