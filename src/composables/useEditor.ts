/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { computed, ref, shallowRef } from 'vue'
import {
  EditHistory,
  cloneEditState,
  createEditState,
  isIdentityTransform,
  renderEdit,
  type AdjustmentKey,
  type CropRect,
  type EditState,
  type FilterName,
} from '../editor/engine'
import { DEFAULT_ADJUSTMENTS } from '../editor/engine/adjustments'
import { loadDocument } from '../editor/io'
import type { LayerSummary } from '../editor/psd'
import { fetchFile } from '../utils/fetchFile'
import { saveFile } from '../utils/saveFile'
import { renderThumbnail } from '../utils/thumbnail'
import { uploadThumbnail } from '../utils/thumbnailUpload'
import { copyCanvas } from '../editor/engine'
import { canvasToDataUrl } from '../editor/io/decode'
import { extensionOf, isServerEncodable, mimeForExtension } from '../editor/mimeTypes'
import type { LoadResponse } from '../types/loadResponse'

export type EditorStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * The whole editor state and behaviour, kept out of the component so the view
 * stays a thin template.
 */
export function useEditor(fileId: string | null) {
  const status = ref<EditorStatus>('idle')
  const errorMessage = ref<string | null>(null)
  const statusMessage = ref('')
  const saving = ref(false)
  const dirty = ref(false)

  const meta = ref<LoadResponse | null>(null)
  const layers = ref<LayerSummary[]>([])
  const description = ref('')
  const isPsd = ref(false)

  // The decoded source is held in a shallow ref: it is a large, mutable DOM
  // object that Vue must not try to make reactive.
  const sourceCanvas = shallowRef<HTMLCanvasElement | null>(null)
  const previewCanvas = shallowRef<HTMLCanvasElement | null>(null)

  const history = new EditHistory(createEditState())
  const historyVersion = ref(0)

  const state = computed<EditState>(() => {
    // Touch historyVersion so the computed re-evaluates on every edit.
    void historyVersion.value
    return history.present
  })

  const canUndo = computed(() => {
    void historyVersion.value
    return history.canUndo
  })

  const canRedo = computed(() => {
    void historyVersion.value
    return history.canRedo
  })

  const canSave = computed(() => meta.value?.canSave === true)
  const isPsdSource = computed(() => isPsd.value)
  const dimensions = computed(() => {
    const canvas = previewCanvas.value
    return canvas ? { width: canvas.width, height: canvas.height } : null
  })

  const hasEdits = computed(() => {
    void historyVersion.value
    const current = state.value
    return (
      !isIdentityTransform(current.transform)
      || JSON.stringify(current.adjustments) !== JSON.stringify(DEFAULT_ADJUSTMENTS)
      || Object.values(current.filters).some(Boolean)
    )
  })

  /** Render the current state and publish the result. */
  function rerender(): void {
    const source = sourceCanvas.value
    if (source === null) {
      return
    }

    previewCanvas.value = renderEdit(source, state.value).canvas
  }

  function commit(next: EditState): void {
    history.push(next)
    historyVersion.value += 1
    dirty.value = true
    rerender()
  }

  /** Patch the adjustments and commit the change. */
  function setAdjustment(key: AdjustmentKey, value: number): void {
    const next = cloneEditState(state.value)
    next.adjustments[key] = value
    commit(next)
  }

  function resetAdjustments(): void {
    const next = cloneEditState(state.value)
    next.adjustments = { ...DEFAULT_ADJUSTMENTS }
    commit(next)
  }

  function toggleFilter(name: FilterName): void {
    const next = cloneEditState(state.value)
    next.filters[name] = !next.filters[name]
    commit(next)
  }

  function rotate(delta: number): void {
    const next = cloneEditState(state.value)
    next.transform.rotation = (((next.transform.rotation + delta) % 360) + 360) % 360
    commit(next)
  }

  function flip(axis: 'horizontal' | 'vertical'): void {
    const next = cloneEditState(state.value)
    if (axis === 'horizontal') {
      next.transform.flipHorizontal = !next.transform.flipHorizontal
    } else {
      next.transform.flipVertical = !next.transform.flipVertical
    }
    commit(next)
  }

  function setCrop(crop: CropRect | null): void {
    const next = cloneEditState(state.value)
    next.transform.crop = crop
    commit(next)
  }

  function resize(width: number | null, height: number | null): void {
    const next = cloneEditState(state.value)
    next.transform.width = width
    next.transform.height = height
    commit(next)
  }

  function undo(): void {
    history.undo()
    historyVersion.value += 1
    dirty.value = true
    rerender()
  }

  function redo(): void {
    history.redo()
    historyVersion.value += 1
    dirty.value = true
    rerender()
  }

  function resetEdits(): void {
    history.reset(createEditState())
    historyVersion.value += 1
    dirty.value = true
    rerender()
  }

  /** Export the current view as a data URL in the given format. */
  function exportDataUrl(extension: string): string | null {
    const canvas = previewCanvas.value
    if (canvas === null) {
      return null
    }
    return canvasToDataUrl(canvas, mimeForExtension(extension))
  }

  /**
   * Save the current view back to the file.
   *
   * The canvas is captured before the request is sent, so an edit made while
   * the save is in flight cannot be uploaded under the version that was saved.
   * `dirty` is only cleared when the state is still the one that was saved;
   * otherwise the newer edit stays marked as unsaved.
   */
  async function save(): Promise<boolean> {
    const currentMeta = meta.value
    const canvas = previewCanvas.value
    if (currentMeta === null || canvas === null || saving.value) {
      return false
    }

    if (!currentMeta.canSave) {
      statusMessage.value = 'This file cannot be saved. Use Export instead.'
      return false
    }

    // Browsers only encode PNG and JPEG reliably; GIF, BMP and AVIF are
    // decoded but re-encode as PNG, which the server would then write under the
    // original extension. Those formats are exported instead of saved.
    const extension = extensionOf(currentMeta.name)
    if (!isServerEncodable(extension)) {
      statusMessage.value = `This file cannot be saved as ${extension.toUpperCase()}. Use Export instead.`
      return false
    }

    saving.value = true
    statusMessage.value = 'Saving…'

    const savedVersion = historyVersion.value
    const savedEtag = currentMeta.etag
    const savedCanvas = copyCanvas(canvas)
    const dataUrl = canvasToDataUrl(savedCanvas, mimeForExtension(extension))

    const result = await saveFile(currentMeta.id, savedEtag, dataUrl)
    saving.value = false

    if (!result.ok) {
      statusMessage.value = result.error ?? 'Could not save the image.'
      return false
    }

    if (result.etag) {
      meta.value = { ...currentMeta, etag: result.etag }
    }

    // A newer edit arrived while the request was in flight; it is not what was
    // written, so it stays unsaved and is not used for the thumbnail.
    if (historyVersion.value !== savedVersion) {
      statusMessage.value = 'Saved. You have newer changes that are not saved yet.'
      return true
    }

    dirty.value = false
    statusMessage.value = 'Saved'
    void uploadThumbnail(result.etag ?? savedEtag, renderThumbnail(savedCanvas), {
      fileId: currentMeta.id,
    })
    return true
  }

  async function refreshThumbnail(): Promise<void> {
    const currentMeta = meta.value
    const canvas = previewCanvas.value
    if (currentMeta === null || canvas === null) {
      return
    }

    await uploadThumbnail(currentMeta.etag, renderThumbnail(canvas), { fileId: currentMeta.id })
  }

  /** Load the file and prepare the editor. */
  async function load(): Promise<void> {
    if (fileId === null || fileId === '') {
      status.value = 'error'
      errorMessage.value = 'No file selected. Open an image from Nextcloud Files.'
      return
    }

    status.value = 'loading'
    errorMessage.value = null

    const result = await fetchFile(fileId)
    if (!result.ok) {
      status.value = 'error'
      errorMessage.value = result.error ?? 'Failed to load the file.'
      return
    }

    try {
      const document = await loadDocument(result.bytes, result.meta.name)
      sourceCanvas.value = document.canvas
      layers.value = document.layers
      description.value = document.description
      isPsd.value = document.isPsd
      meta.value = result.meta

      history.reset(createEditState())
      historyVersion.value += 1
      dirty.value = false
      rerender()

      status.value = 'ready'
      void refreshThumbnail()
    } catch (err) {
      status.value = 'error'
      errorMessage.value = err instanceof Error ? err.message : 'Failed to open the image.'
    }
  }

  return {
    status,
    errorMessage,
    statusMessage,
    saving,
    dirty,
    meta,
    layers,
    description,
    isPsd,
    isPsdSource,
    previewCanvas,
    state,
    canUndo,
    canRedo,
    canSave,
    hasEdits,
    dimensions,
    load,
    save,
    undo,
    redo,
    resetEdits,
    setAdjustment,
    resetAdjustments,
    toggleFilter,
    rotate,
    flip,
    setCrop,
    resize,
    exportDataUrl,
    refreshThumbnail,
  }
}
