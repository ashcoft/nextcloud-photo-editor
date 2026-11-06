<template>
  <div id="photo-editor-wrapper" class="photo-editor-wrapper" :class="`photo-editor-wrapper--${theme}`">
    <header class="photo-editor-toolbar">
      <div class="photo-editor-toolbar__group">
        <button
          type="button"
          class="button"
          :disabled="!canUndo"
          :title="appTranslation('Undo the last change')"
          @click="undo"
        >
          {{ appTranslation('Undo') }}
        </button>
        <button
          type="button"
          class="button"
          :disabled="!canRedo"
          :title="appTranslation('Redo the change')"
          @click="redo"
        >
          {{ appTranslation('Redo') }}
        </button>
        <button
          type="button"
          class="button"
          :disabled="!hasEdits"
          :title="appTranslation('Discard all changes')"
          @click="resetEdits"
        >
          {{ appTranslation('Reset') }}
        </button>
      </div>

      <div class="photo-editor-toolbar__group photo-editor-toolbar__group--end">
        <button
          v-if="canSave"
          type="button"
          class="button primary"
          :disabled="saving"
          :title="appTranslation('Save the image back to its file')"
          @click="onSave"
        >
          {{ saving ? appTranslation('Saving…') : appTranslation('Save') }}
        </button>
        <button
          type="button"
          class="button"
          :title="appTranslation('Export a copy of the current view')"
          @click="onExport"
        >
          {{ appTranslation('Export') }}
        </button>
        <button
          type="button"
          class="button"
          :title="appTranslation('Close the editor and return to Files')"
          @click="exitEditor"
        >
          {{ appTranslation('Exit') }}
        </button>
        <span v-if="statusMessage" class="photo-editor-toolbar__status" role="status">
          {{ statusMessage }}
        </span>
      </div>
    </header>

    <div v-if="status === 'ready'" class="photo-editor-body">
      <aside class="photo-editor-panel" :aria-label="appTranslation('Editing tools')">
        <section class="photo-editor-section">
          <h3 class="photo-editor-section__title">{{ appTranslation('Adjustments') }}</h3>

          <label
            v-for="control in adjustmentControls"
            :key="control.key"
            class="photo-editor-control"
          >
            <span class="photo-editor-control__label">
              {{ appTranslation(control.label) }}
              <output class="photo-editor-control__value">{{ formatValue(control.key) }}</output>
            </span>
            <input
              type="range"
              :min="control.min"
              :max="control.max"
              :step="control.step"
              :value="state.adjustments[control.key]"
              @input="onAdjustment(control.key, $event)"
            >
          </label>

          <button type="button" class="button photo-editor-section__action" @click="resetAdjustments">
            {{ appTranslation('Reset adjustments') }}
          </button>
        </section>

        <section class="photo-editor-section">
          <h3 class="photo-editor-section__title">{{ appTranslation('Filters') }}</h3>
          <label v-for="name in filterNames" :key="name" class="photo-editor-check">
            <input
              type="checkbox"
              :checked="state.filters[name]"
              @change="toggleFilter(name)"
            >
            <span>{{ appTranslation(filterLabel(name)) }}</span>
          </label>
        </section>

        <section class="photo-editor-section">
          <h3 class="photo-editor-section__title">{{ appTranslation('Transform') }}</h3>
          <div class="photo-editor-buttons">
            <button type="button" class="button" @click="rotate(-90)">
              {{ appTranslation('Rotate left') }}
            </button>
            <button type="button" class="button" @click="rotate(90)">
              {{ appTranslation('Rotate right') }}
            </button>
            <button type="button" class="button" @click="flip('horizontal')">
              {{ appTranslation('Flip horizontal') }}
            </button>
            <button type="button" class="button" @click="flip('vertical')">
              {{ appTranslation('Flip vertical') }}
            </button>
          </div>

          <div class="photo-editor-crop">
            <label class="photo-editor-control">
              <span class="photo-editor-control__label">{{ appTranslation('Crop width') }}</span>
              <input v-model.number="crop.width" type="number" min="1" :max="sourceWidth">
            </label>
            <label class="photo-editor-control">
              <span class="photo-editor-control__label">{{ appTranslation('Crop height') }}</span>
              <input v-model.number="crop.height" type="number" min="1" :max="sourceHeight">
            </label>
            <button type="button" class="button photo-editor-section__action" @click="applyCrop">
              {{ appTranslation('Apply crop') }}
            </button>
            <button
              type="button"
              class="button photo-editor-section__action"
              :disabled="state.transform.crop === null"
              @click="setCrop(null)"
            >
              {{ appTranslation('Clear crop') }}
            </button>
          </div>

          <div class="photo-editor-resize">
            <label class="photo-editor-control">
              <span class="photo-editor-control__label">{{ appTranslation('Width') }}</span>
              <input v-model.number="resizeWidth" type="number" min="1">
            </label>
            <label class="photo-editor-control">
              <span class="photo-editor-control__label">{{ appTranslation('Height') }}</span>
              <input v-model.number="resizeHeight" type="number" min="1">
            </label>
            <button type="button" class="button photo-editor-section__action" @click="applyResize">
              {{ appTranslation('Apply resize') }}
            </button>
          </div>
        </section>

        <section v-if="layers.length > 0" class="photo-editor-section">
          <h3 class="photo-editor-section__title">{{ appTranslation('Layers') }}</h3>
          <ul class="photo-editor-layers">
            <li
              v-for="layer in layers"
              :key="layer.id"
              class="photo-editor-layer"
              :style="{ paddingLeft: `${0.5 + layer.depth * 0.9}rem` }"
              :class="{ 'photo-editor-layer--hidden': !layer.visible }"
            >
              <span class="photo-editor-layer__name">{{ layer.name || appTranslation('Layer') }}</span>
              <span class="photo-editor-layer__meta">
                {{ layer.isGroup ? appTranslation('Group') : layer.blendMode }}
              </span>
            </li>
          </ul>
        </section>
      </aside>

      <main class="photo-editor-canvas-area">
        <canvas
          ref="canvasElement"
          class="photo-editor-canvas"
          :class="{ 'photo-editor-canvas--checker': isPsd }"
        ></canvas>
      </main>

      <aside class="photo-editor-panel photo-editor-panel--info" :aria-label="appTranslation('File information')">
        <h3 class="photo-editor-section__title">{{ appTranslation('File') }}</h3>
        <dl class="photo-editor-info">
          <dt>{{ appTranslation('Name') }}</dt>
          <dd>{{ meta?.name }}</dd>
          <dt>{{ appTranslation('Source') }}</dt>
          <dd>{{ description }}</dd>
          <dt v-if="dimensions">{{ appTranslation('View') }}</dt>
          <dd v-if="dimensions">{{ dimensions.width }}×{{ dimensions.height }}</dd>
          <dt>{{ appTranslation('Size') }}</dt>
          <dd>{{ formatBytes(meta?.size ?? 0) }}</dd>
        </dl>
        <p v-if="!canSave" class="photo-editor-info__note">
          {{ appTranslation('This file is read-only in the editor. Use Export to save a copy.') }}
        </p>
      </aside>
    </div>

    <div v-else class="photo-editor-overlay">
      <div v-if="status === 'loading'" class="photo-editor-loading">
        <div class="spinner"></div>
        <p>{{ appTranslation('Loading image…') }}</p>
      </div>
      <div v-else-if="status === 'error'" class="photo-editor-error">
        <p>{{ errorMessage }}</p>
        <button type="button" class="button primary" @click="load">
          {{ appTranslation('Retry') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue'
import { translate } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { useEditor } from './composables/useEditor'
import { ADJUSTMENT_RANGES, FILTERS, type AdjustmentKey, type FilterName } from './editor/engine'

const appTranslation = (text: string): string => translate('photo_editor', text)

interface AdjustmentControl {
  key: AdjustmentKey
  label: string
  min: number
  max: number
  step: number
}

const FILTER_LABELS: Record<FilterName, string> = {
  grayscale: 'Grayscale',
  sepia: 'Sepia',
  invert: 'Invert',
  blur: 'Blur',
  sharpen: 'Sharpen',
  autoContrast: 'Auto contrast',
}

const ADJUSTMENT_LABELS: Record<AdjustmentKey, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  exposure: 'Exposure',
  temperature: 'Temperature',
  hue: 'Hue',
  gamma: 'Gamma',
}

export default defineComponent({
  name: 'PhotoEditorApp',
  props: {
    fileId: {
      type: [String, Number],
      default: null,
    },
  },
  setup(props) {
    const editor = useEditor(props.fileId === null ? null : String(props.fileId))

    const canvasElement = ref<HTMLCanvasElement | null>(null)

    const adjustmentControls: AdjustmentControl[] = (Object.keys(ADJUSTMENT_LABELS) as AdjustmentKey[])
      .map((key) => ({
        key,
        label: ADJUSTMENT_LABELS[key],
        min: ADJUSTMENT_RANGES[key].min,
        max: ADJUSTMENT_RANGES[key].max,
        step: ADJUSTMENT_RANGES[key].step,
      }))

    const filterNames = FILTERS as readonly FilterName[]

    // Crop and resize inputs are local working values; they are only pushed
    // into the edit state when the user applies them.
    const crop = ref({ width: 100, height: 100 })
    const resizeWidth = ref(0)
    const resizeHeight = ref(0)

    const sourceWidth = ref(0)
    const sourceHeight = ref(0)

    const theme = ref<'light' | 'dark'>('light')

    function syncCanvasSize(): void {
      const source = editor.previewCanvas.value
      if (source) {
        sourceWidth.value = source.width
        sourceHeight.value = source.height
        resizeWidth.value = source.width
        resizeHeight.value = source.height
        crop.value = {
          width: Math.min(crop.value.width, source.width),
          height: Math.min(crop.value.height, source.height),
        }
      }
    }

    /**
     * Paint the preview canvas into the visible element.
     *
     * The composable keeps the pixels in an offscreen canvas; this copies them
     * into the DOM canvas, sized to match, so the browser handles scrolling and
     * scaling.
     */
    function paint(): void {
      const target = canvasElement.value
      const source = editor.previewCanvas.value
      if (!target || !source) {
        return
      }

      target.width = source.width
      target.height = source.height
      const context = target.getContext('2d')
      if (context) {
        context.clearRect(0, 0, target.width, target.height)
        context.drawImage(source, 0, 0)
      }
    }

    watch(() => editor.previewCanvas.value, () => {
      paint()
      syncCanvasSize()
    })

    watch(() => editor.status.value, (value) => {
      if (value === 'ready') {
        paint()
        syncCanvasSize()
      }
    })

    function onAdjustment(key: AdjustmentKey, event: Event): void {
      const value = Number((event.target as HTMLInputElement).value)
      editor.setAdjustment(key, value)
    }

    function formatValue(key: AdjustmentKey): string {
      const value = editor.state.value.adjustments[key]
      return key === 'gamma' ? value.toFixed(2) : String(Math.round(value))
    }

    function toggleFilter(name: FilterName): void {
      editor.toggleFilter(name)
    }

    function filterLabel(name: FilterName): string {
      return FILTER_LABELS[name]
    }

    function applyCrop(): void {
      editor.setCrop({
        x: 0,
        y: 0,
        width: crop.value.width,
        height: crop.value.height,
      })
    }

    function applyResize(): void {
      editor.resize(
        resizeWidth.value > 0 ? resizeWidth.value : null,
        resizeHeight.value > 0 ? resizeHeight.value : null,
      )
    }

    async function onSave(): Promise<void> {
      await editor.save()
    }

    function onExport(): void {
      const dataUrl = editor.exportDataUrl('png')
      if (!dataUrl) {
        return
      }
      const link = document.createElement('a')
      const base = editor.meta.value?.name?.replace(/\.[^.]+$/, '') ?? 'export'
      link.href = dataUrl
      link.download = `${base}.png`
      link.click()
    }

    function exitEditor(): void {
      const directory = editor.meta.value?.directory ?? '/'
      const params = new URLSearchParams({ dir: directory })
      window.location.href = generateUrl('/apps/files/') + '?' + params.toString()
    }

    function formatBytes(bytes: number): string {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
    }

    onMounted(async () => {
      theme.value = editor.meta.value?.theme ?? 'light'
      await editor.load()
      theme.value = editor.meta.value?.theme ?? theme.value
      paint()
      syncCanvasSize()
    })

    return {
      ...editor,
      canvasElement,
      adjustmentControls,
      filterNames,
      crop,
      resizeWidth,
      resizeHeight,
      sourceWidth,
      sourceHeight,
      theme,
      onAdjustment,
      formatValue,
      toggleFilter,
      filterLabel,
      applyCrop,
      applyResize,
      onSave,
      onExport,
      exitEditor,
      formatBytes,
      appTranslation,
    }
  },
})
</script>

<style scoped>
.photo-editor-wrapper {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100vh;
  min-height: 100vh;
  background: var(--color-main-background);
  color: var(--color-main-text);
}

.photo-editor-toolbar {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-main-background);
}

.photo-editor-toolbar__group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.photo-editor-toolbar__group--end {
  margin-left: auto;
}

.photo-editor-toolbar__status {
  margin-left: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-maxcontrast);
}

.photo-editor-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.photo-editor-panel {
  flex: 0 0 18rem;
  max-width: 18rem;
  overflow-y: auto;
  padding: 1rem;
  border-right: 1px solid var(--color-border);
  background: var(--color-main-background);
}

.photo-editor-panel--info {
  flex-basis: 15rem;
  max-width: 15rem;
  border-right: none;
  border-left: 1px solid var(--color-border);
}

.photo-editor-section {
  margin-bottom: 1.5rem;
}

.photo-editor-section__title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}

.photo-editor-section__action {
  margin-top: 0.5rem;
}

.photo-editor-control {
  display: block;
  margin-bottom: 0.75rem;
}

.photo-editor-control__label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.2rem;
  font-size: 0.875rem;
}

.photo-editor-control__value {
  color: var(--color-text-maxcontrast);
}

.photo-editor-control input[type='range'] {
  width: 100%;
}

.photo-editor-control input[type='number'] {
  box-sizing: border-box;
  width: 100%;
}

.photo-editor-check {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
}

.photo-editor-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.photo-editor-crop,
.photo-editor-resize {
  margin-top: 0.75rem;
}

.photo-editor-layers {
  margin: 0;
  padding: 0;
  list-style: none;
}

.photo-editor-layer {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  border-radius: var(--border-radius, 4px);
  font-size: 0.85rem;
}

.photo-editor-layer--hidden {
  opacity: 0.5;
}

.photo-editor-layer__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-editor-layer__meta {
  color: var(--color-text-maxcontrast);
}

.photo-editor-canvas-area {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: auto;
  padding: 1.5rem;
  background: var(--color-background-dark);
}

.photo-editor-canvas {
  max-width: 100%;
  max-height: 100%;
  box-shadow: 0 2px 16px rgb(0 0 0 / 30%);
}

/* PSD documents can have transparent regions; a checkerboard makes them
 * visible instead of showing whatever is behind the canvas. */
.photo-editor-canvas--checker {
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-color: #fff;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}

.photo-editor-info {
  margin: 0;
  font-size: 0.85rem;
}

.photo-editor-info dt {
  margin-top: 0.5rem;
  color: var(--color-text-maxcontrast);
}

.photo-editor-info dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.photo-editor-info__note {
  margin-top: 1rem;
  color: var(--color-text-maxcontrast);
  font-size: 0.8rem;
}

.photo-editor-overlay {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
}

.photo-editor-loading,
.photo-editor-error {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  padding: 2rem;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary-element);
  border-radius: 50%;
  animation: photo-editor-spin 1s linear infinite;
}

@keyframes photo-editor-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .photo-editor-body {
    flex-direction: column;
    overflow: auto;
  }

  .photo-editor-panel {
    flex-basis: auto;
    max-width: none;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }

  .photo-editor-panel--info {
    border-left: none;
  }
}
</style>
