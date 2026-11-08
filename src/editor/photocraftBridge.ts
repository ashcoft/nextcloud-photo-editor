/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Bridges a Nextcloud file to the embedded PhotoCraft editor.
 *
 * PhotoCraft is a third-party WASM application served in a same-origin iframe.
 * It has no host API, so the two directions go through the interfaces it does
 * expose:
 *
 *  - **In:** a file reaches it as an HTML5 drop. The bridge builds a `File`
 *    from the bytes and dispatches `dragenter`/`dragover`/`drop` with a
 *    `DataTransfer` carrying it, which is the same path a user's drag takes.
 *  - **Out:** Save and Export build a Blob, hand it to `URL.createObjectURL`
 *    and click an `<a download>`. The bridge wraps both inside the iframe so
 *    the bytes can be read and written back instead of downloaded.
 *
 * Both depend on the app's internals rather than a published contract, so
 * `tests/e2e/photocraftBridge.spec.ts` is the guard: it fails if a PhotoCraft
 * upgrade changes how it accepts a drop or emits a save.
 */

/** A file the editor produced, ready to be written back or downloaded. */
export interface BridgeOutput {
  /** File name the editor chose, e.g. `holiday.psd`. */
  name: string
  /** MIME type of the produced bytes. */
  type: string
  /** The produced bytes. */
  blob: Blob
}

export interface BridgeOptions {
  /**
   * Whether the host takes over a produced file.
   *
   * PhotoCraft's own download is allowed to proceed when this returns false,
   * which is the right outcome when the host cannot store the output - a
   * Photoshop document cannot be written over a PNG, for instance.
   */
  shouldIntercept: (output: { name: string; type: string }) => boolean
  /** Called when the editor produces a file the host takes over. */
  onOutput: (output: BridgeOutput) => void
}

/**
 * The editor's canvas is not ready until its loading overlay is gone; polling
 * for the drop target is more robust than a fixed delay.
 */
const READY_POLL_MS = 250
const READY_TIMEOUT_MS = 120_000

/** How long to wait for the editor to accept a dropped file. */
const DROP_SETTLE_MS = 1_500

export class PhotocraftBridge {
  private patched = false

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly options: BridgeOptions,
  ) {}

  /**
   * Resolve once the editor has booted and can accept a file.
   */
  async ready(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS

    // A poll rather than a fixed delay: the bundle's HTML load event fires
    // before the WASM application installs its drop handlers.
    const poll = async (): Promise<void> => {
      const document = this.frame.contentDocument
      if (document && this.dropTarget(document) !== null && !document.getElementById('photocraft_loading')) {
        return
      }
      if (Date.now() >= deadline) {
        throw new Error('The editor did not finish loading.')
      }
      await delay(READY_POLL_MS)
      return poll()
    }

    return poll()
  }

  /**
   * Hand a file to the editor.
   *
   * The bytes are wrapped in a `File` so the editor sees exactly what a user's
   * drag would carry.
   */
  async open(name: string, type: string, bytes: Uint8Array): Promise<void> {
    const window = this.contentWindow()
    const document = this.requireDocument()

    // Copy into a fresh buffer: the iframe may transfer it, and the caller's
    // array is reused for the next attempt.
    const file = new (window.File as typeof File)(
      [new Uint8Array(bytes)],
      name,
      { type: type || 'application/octet-stream' },
    )

    const transfer = new (window.DataTransfer as typeof DataTransfer)()
    transfer.items.add(file)

    const target = this.dropTarget(document)
    if (target === null) {
      throw new Error('The editor is not ready to accept a file.')
    }

    for (const kind of ['dragenter', 'dragover', 'drop'] as const) {
      target.dispatchEvent(
        new (window.DragEvent as typeof DragEvent)(kind, {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      )
    }

    // The drop is handled asynchronously inside the app; give it a moment so a
    // following save does not race the open.
    await delay(DROP_SETTLE_MS)
  }

  /**
   * Wrap the iframe's download path so produced files come back to the host.
   *
   * Installed once, on the first successful boot. `createObjectURL` is wrapped
   * to remember the Blob behind each URL, and `HTMLAnchorElement.click` to
   * catch the download before the browser acts on it. Anything that is not a
   * blob-backed download is left alone, so the app's own links still work.
   */
  install(): void {
    if (this.patched) {
      return
    }

    const window = this.contentWindow()
    const blobs = new Map<string, Blob>()
    const { onOutput, shouldIntercept } = this.options

    const originalCreate = window.URL.createObjectURL.bind(window.URL)
    window.URL.createObjectURL = (object: Blob | MediaSource): string => {
      const url = originalCreate(object as Blob)
      if (object instanceof window.Blob) {
        blobs.set(url, object)
      }
      return url
    }

    const originalRevoke = window.URL.revokeObjectURL.bind(window.URL)
    window.URL.revokeObjectURL = (url: string): void => {
      blobs.delete(url)
      originalRevoke(url)
    }

    const proto = window.HTMLAnchorElement.prototype
    const originalClick = proto.click

    // A regular function: it becomes the anchor's `click`, so `this` is the
    // anchor. `onOutput` is captured above.
    proto.click = function (this: HTMLAnchorElement): void {
      const url = this.href
      const blob = blobs.get(url)

      if (blob !== undefined && this.hasAttribute('download')) {
        const name = this.getAttribute('download') || 'download'

        // The host only takes over a file it can store. When it cannot - the
        // editor produced a Photoshop document but the file is a PNG - the
        // editor's own download runs, so the user still gets their file.
        if (!shouldIntercept({ name, type: blob.type })) {
          originalClick.call(this)
          return
        }

        blobs.delete(url)
        originalRevoke(url)
        onOutput({ name, type: blob.type, blob })
        return
      }

      originalClick.call(this)
    }

    this.patched = true
  }

  /**
   * Stop intercepting. The iframe's own functions cannot be restored once
   * patched (the original is held by the closure), so this only marks the
   * bridge as no longer forwarding output; the iframe is discarded with the
   * page.
   */
  dispose(): void {
    this.patched = false
  }

  /**
   * The element the editor listens for drops on.
   *
   * The canvas fills the frame; the app installs its drag handlers on the
   * window, so an event dispatched on the canvas reaches them by bubbling.
   */
  private dropTarget(document: Document): HTMLElement | null {
    return document.getElementById('photocraft_canvas')
  }

  private contentWindow(): Window & typeof globalThis {
    const window = this.frame.contentWindow as (Window & typeof globalThis) | null
    if (window === null) {
      throw new Error('The editor frame is not available.')
    }
    return window
  }

  private requireDocument(): Document {
    const document = this.frame.contentDocument
    if (document === null) {
      throw new Error('The editor frame is not available.')
    }
    return document
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
