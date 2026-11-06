/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { LoadResponse } from '../types/loadResponse'

/**
 * A file ready to hand to the editor, or the reason it could not be read.
 */
export type FileLoadResult =
  | { ok: true; meta: LoadResponse; bytes: Uint8Array }
  | { ok: false; error?: string }

/**
 * Fetch a file's metadata and bytes.
 *
 * Both requests go through @nextcloud/axios so they carry the requesttoken
 * header Nextcloud requires for CSRF protection.
 *
 * Server error responses (413 too large, 415 unsupported type, 404, 403, ...)
 * are returned as `error` so the caller can show the real reason instead of a
 * generic message.
 */
export async function fetchFile(fileId: number | string): Promise<FileLoadResult> {
  try {
    const url = generateUrl('/apps/photo_editor/api/load/{fileId}', { fileId: String(fileId) })
    const metaResponse = (await axios.get(url)) as { data: LoadResponse }
    const meta = metaResponse.data

    if (meta.error) {
      return { ok: false, error: meta.error }
    }

    const blobResponse = (await axios.get(meta.url, { responseType: 'arraybuffer' })) as {
      data: ArrayBuffer
    }
    const bytes = new Uint8Array(blobResponse.data)

    return { ok: true, meta, bytes }
  } catch (err) {
    // Log only a safe description: the axios error carries
    // config.headers.requesttoken, so it must never be logged whole.
    const status = (err as { response?: { status?: number } } | null)?.response?.status
    console.error('Photo Editor: failed to fetch file content', status ?? 'request failed')
    return { ok: false, error: await extractErrorMessage(err) }
  }
}

/**
 * Read the `error` field Nextcloud's DataResponse carries on a failed request.
 *
 * The download request uses `responseType: 'arraybuffer'`, so its error body
 * arrives as an ArrayBuffer rather than parsed JSON and has to be decoded
 * first.
 */
async function extractErrorMessage(err: unknown): Promise<string | undefined> {
  const data = (err as { response?: { data?: unknown } } | null)?.response?.data

  let parsed: unknown = data
  if (data instanceof ArrayBuffer) {
    try {
      parsed = JSON.parse(new TextDecoder().decode(data))
    } catch {
      parsed = undefined
    }
  } else if (isBlobLike(data)) {
    try {
      parsed = JSON.parse(await data.text())
    } catch {
      parsed = undefined
    }
  }

  const message = (parsed as { error?: unknown } | undefined)?.error
  return typeof message === 'string' && message !== '' ? message : undefined
}

function isBlobLike(value: unknown): value is { text: () => Promise<string> } {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { text?: unknown }).text === 'function'
  )
}
