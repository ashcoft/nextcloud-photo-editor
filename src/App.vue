<template>
  <div id="photo-editor-wrapper" class="photo-editor-wrapper" :class="`photo-editor-wrapper--${theme}`">
    <header class="photo-editor-toolbar">
      <div class="photo-editor-toolbar__group">
        <span class="photo-editor-toolbar__file">{{ fileName }}</span>
      </div>

      <div class="photo-editor-toolbar__group photo-editor-toolbar__group--end">
        <button
          v-if="canSave"
          type="button"
          class="button primary"
          :disabled="saving || status !== 'ready'"
          :title="appTranslation('Save the document back to its file')"
          @click="onSave"
        >
          {{ saving ? appTranslation('Saving…') : appTranslation('Save') }}
        </button>
        <button
          type="button"
          class="button"
          :disabled="status !== 'ready'"
          :title="appTranslation('Download a copy of the current document')"
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
      </div>
    </header>

    <div class="photo-editor-body">
      <p v-if="status === 'loading'" class="photo-editor-status" role="status">
        {{ appTranslation('Loading the editor…') }}
      </p>
      <p v-else-if="status === 'error'" class="photo-editor-status photo-editor-status--error" role="alert">
        {{ errorMessage }}
      </p>
      <p v-if="statusMessage" class="photo-editor-status" role="status">{{ statusMessage }}</p>

      <!--
        The editor fills the frame and is kept mounted once loaded: remounting
        it would discard the user's document, so the toolbar and status overlay
        it instead.
      -->
      <iframe
        ref="frameElement"
        class="photo-editor-frame"
        :class="{ 'photo-editor-frame--hidden': status !== 'ready' }"
        :src="editorUrl"
        title="PhotoCraft"
        allow="fullscreen; clipboard-read; clipboard-write"
        allowfullscreen
        @load="onFrameLoad"
      ></iframe>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, ref } from 'vue'
import { translate } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { PhotocraftBridge, type BridgeOutput } from './editor/photocraftBridge'
import { renderPsdThumbnail } from './editor/psdThumbnail'
import { fetchFile } from './utils/fetchFile'
import { saveFile } from './utils/saveFile'
import { uploadThumbnail } from './utils/thumbnailUpload'

const appTranslation = (text: string): string => translate('photo_editor', text)

export default defineComponent({
  name: 'PhotoEditorApp',

  props: {
    fileId: {
      type: String as () => string | null,
      default: null,
    },
  },

  setup(props) {
    const frameElement = ref<HTMLIFrameElement | null>(null)
    const status = ref<'loading' | 'ready' | 'error'>('loading')
    const errorMessage = ref('')
    const statusMessage = ref('')
    const saving = ref(false)
    const canSave = ref(false)
    const fileName = ref('')
    const theme = ref<'light' | 'dark'>('light')
    /** Whether the open document is a Photoshop file, which needs a preview. */
    const isPsdFile = ref(false)

    let etag = ''
    let fileId: number | null = null
    let bridge: PhotocraftBridge | null = null
    /** The most recent file the editor produced, held until Save or Export. */
    let lastOutput: BridgeOutput | null = null

    // The bundle is served by the app, so the frame stays same-origin and the
    // bridge can reach into it.
    const editorUrl = computed(() => generateUrl('/apps/photo_editor/photocraft/index.html'))

    /**
     * Called when the editor produces a file, from either its Save or Export.
     *
     * The editor's own Save is an explicit user action, so it writes straight
     * back to the file when the file is writable; Export is left for the
     * toolbar, which downloads the bytes without touching the stored file.
     */
    function onOutput(output: BridgeOutput): void {
      lastOutput = output

      if (canSave.value && fileId !== null) {
        void onSave()
        return
      }

      statusMessage.value = appTranslation('The editor produced a file. Use Export to download it.')
    }

    /**
     * Render and upload a preview for a Photoshop document.
     *
     * Failures are ignored: a missing thumbnail is cosmetic, and the Files grid
     * keeps its generic icon. The bytes are the ones just loaded, so the
     * thumbnail always matches the version it was rendered from.
     */
    async function refreshThumbnail(bytes: Uint8Array, version: string): Promise<void> {
      try {
        const dataUrl = await renderPsdThumbnail(bytes)
        await uploadThumbnail(version, dataUrl, { fileId: fileId ?? undefined })
      } catch {
        // Ignore: the generic file icon stays until a thumbnail is available.
      }
    }

    /**
     * Write the editor's output back to the stored file.
     */
    async function onSave(): Promise<void> {
      if (lastOutput === null || fileId === null) {
        statusMessage.value = appTranslation('Make a change in the editor, then save.')
        return
      }

      saving.value = true
      statusMessage.value = appTranslation('Saving…')

      try {
        const dataUrl = await blobToDataUrl(lastOutput.blob)
        const result = await saveFile(fileId, etag, dataUrl)

        if (!result.ok) {
          statusMessage.value = result.error ?? appTranslation('Could not save the file.')
          return
        }

        etag = result.etag ?? etag
        statusMessage.value = appTranslation('Saved.')

        // The document changed, so its preview is stale. Re-render from the
        // bytes just written, keyed by the new etag.
        if (isPsdFile.value) {
          const bytes = new Uint8Array(await lastOutput.blob.arrayBuffer())
          void refreshThumbnail(bytes, etag)
        }
      } catch {
        statusMessage.value = appTranslation('Could not save the file.')
      } finally {
        saving.value = false
      }
    }

    /**
     * Download the editor's output without touching the stored file.
     */
    function onExport(): void {
      if (lastOutput === null) {
        statusMessage.value = appTranslation('Make a change in the editor, then export.')
        return
      }

      const url = URL.createObjectURL(lastOutput.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = lastOutput.name
      anchor.click()
      URL.revokeObjectURL(url)
    }

    function exitEditor(): void {
      window.location.href = generateUrl('/apps/files')
    }

    /**
     * The iframe loaded its document; connect the bridge and hand it the file.
     *
     * `load` fires for the bundle's HTML, but the WASM application inside boots
     * afterwards, so `ready()` polls until the drop target exists.
     */
    async function onFrameLoad(): Promise<void> {
      const frame = frameElement.value
      if (frame === null || props.fileId === null || bridge !== null) {
        return
      }

      try {
        bridge = new PhotocraftBridge(frame, {
          onOutput,
          onError: (message: string) => {
            statusMessage.value = message
          },
        })

        await bridge.ready()
        bridge.install()

        const result = await fetchFile(props.fileId)
        if (!result.ok) {
          status.value = 'error'
          errorMessage.value = result.error ?? appTranslation('Could not open this file.')
          return
        }

        fileId = result.meta.id
        etag = result.meta.etag
        canSave.value = result.meta.canSave
        fileName.value = result.meta.name
        theme.value = result.meta.theme
        isPsdFile.value = result.meta.isPsd

        await bridge.open(result.meta.name, result.meta.contentType, result.bytes)
        status.value = 'ready'

        // A Photoshop document has no server-side previewer, so the Files grid
        // needs one rendered here. Raster formats keep Nextcloud's own
        // previews, so only a PSD triggers this.
        if (result.meta.isPsd) {
          void refreshThumbnail(result.bytes, etag)
        }
      } catch (error) {
        status.value = 'error'
        errorMessage.value = error instanceof Error
          ? error.message
          : appTranslation('Could not start the editor.')
      }
    }

    onBeforeUnmount(() => {
      bridge?.dispose()
    })

    return {
      appTranslation,
      frameElement,
      editorUrl,
      status,
      errorMessage,
      statusMessage,
      saving,
      canSave,
      fileName,
      theme,
      onSave,
      onExport,
      exitEditor,
      onFrameLoad,
    }
  },
})

/**
 * Read a Blob as a base64 data URL.
 *
 * The save endpoint takes a data URL rather than a multipart upload, and
 * `FileReader` does the base64 in the browser without a large intermediate
 * string.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsDataURL(blob)
  })
}
</script>

<style scoped>
.photo-editor-wrapper {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-height, 50px));
  overflow: hidden;
}

.photo-editor-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.photo-editor-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.photo-editor-frame--hidden {
  visibility: hidden;
}

.photo-editor-status {
  position: absolute;
  inset: auto 0 0;
  margin: 0;
  padding: 0.5rem 1rem;
  text-align: center;
}

.photo-editor-status--error {
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-editor-toolbar__file {
  font-weight: 600;
  padding-inline: 0.5rem;
}
</style>
