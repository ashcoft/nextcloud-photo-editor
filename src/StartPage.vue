<template>
  <div class="photo-start">
    <header class="photo-start__header">
      <div class="photo-start__intro">
        <h1 class="photo-start__title">{{ appTranslation('Photo Editor') }}</h1>
        <p class="photo-start__subtitle">
          {{ appTranslation('Open a recent image, or browse your files to edit a photo or open a PSD.') }}
        </p>
      </div>
      <div class="photo-start__actions">
        <a class="button primary" :href="filesUrl">{{ appTranslation('Browse files') }}</a>
      </div>
    </header>

    <section v-if="recent.length > 0" class="photo-start__section">
      <h2 class="photo-start__heading">{{ appTranslation('Recent images') }}</h2>
      <ul class="photo-start__grid">
        <li v-for="image in recent" :key="image.id">
          <a class="photo-start__card" :href="editorUrl(image.id)" :title="image.path">
            <svg
              class="photo-start__icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm2.5 10 2.5-3 1.75 2.1L13.5 12l3.5 4.5h-11L7.5 15zM9 9.5A1.5 1.5 0 1 0 9 6.5a1.5 1.5 0 0 0 0 3z" />
            </svg>
            <span class="photo-start__card-body">
              <span class="photo-start__name">{{ image.name }}</span>
              <span class="photo-start__path">{{ folderOf(image.path) }}</span>
              <span class="photo-start__meta">
                <span class="photo-start__badge">{{ image.extension.toUpperCase() }}</span>
                {{ formatMtime(image.mtime) }}
              </span>
            </span>
          </a>
        </li>
      </ul>
    </section>

    <section v-else class="photo-start__empty">
      <h2 class="photo-start__heading">{{ appTranslation('Recent images') }}</h2>
      <p>{{ appTranslation('No images yet.') }}</p>
      <p class="photo-start__hint">
        {{ appTranslation('Upload a photo or a PSD file in Files, then open it here.') }}
      </p>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { translate } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { buildEditorUrl } from './fileActions'
import type { RecentImage } from './types/recentImage'

const appTranslation = (text: string): string => translate('photo_editor', text)

function editorUrl(fileId: number): string {
  return buildEditorUrl(fileId)
}

function formatMtime(mtime: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(mtime * 1000))
}

export default defineComponent({
  name: 'PhotoStartPage',
  props: {
    recent: {
      type: Array as PropType<RecentImage[]>,
      default: () => [],
    },
  },
  setup() {
    const filesUrl = generateUrl('/apps/files/')

    function folderOf(path: string): string {
      const separator = path.lastIndexOf('/')
      return separator > 0 ? path.slice(0, separator) : appTranslation('Home')
    }

    return {
      filesUrl,
      editorUrl,
      folderOf,
      formatMtime,
      appTranslation,
    }
  },
})
</script>

<style scoped>
.photo-start {
  box-sizing: border-box;
  max-width: 1100px;
  min-height: 100%;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
  color: var(--color-main-text);
}

.photo-start__header {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 2.5rem;
}

.photo-start__title {
  margin: 0 0 0.35rem;
  font-size: 2rem;
  font-weight: 700;
}

.photo-start__subtitle {
  margin: 0;
  color: var(--color-text-maxcontrast);
}

.photo-start__actions .button {
  margin: 0;
}

.photo-start__heading {
  margin: 0 0 1rem;
  font-size: 1.15rem;
  font-weight: 600;
}

.photo-start__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.photo-start__card {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  box-sizing: border-box;
  height: 100%;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-large, 12px);
  background: var(--color-main-background);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.photo-start__card:hover,
.photo-start__card:focus-visible {
  border-color: var(--color-primary-element);
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  text-decoration: none;
}

.photo-start__icon {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  color: var(--color-primary-element);
}

.photo-start__card-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.photo-start__name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-start__path {
  overflow: hidden;
  color: var(--color-text-maxcontrast);
  font-size: 0.85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-start__meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.2rem;
  color: var(--color-text-maxcontrast);
  font-size: 0.8rem;
}

.photo-start__badge {
  padding: 0.1rem 0.4rem;
  border-radius: var(--border-radius, 4px);
  background: var(--color-background-dark);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.photo-start__empty {
  padding: 3rem 1.5rem;
  border: 1px dashed var(--color-border);
  border-radius: var(--border-radius-large, 12px);
  text-align: center;
}

.photo-start__hint {
  color: var(--color-text-maxcontrast);
  font-size: 0.9rem;
}
</style>
