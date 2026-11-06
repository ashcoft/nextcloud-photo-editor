/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import type { SaveResponse } from '../types/saveResponse'

export interface SaveResult {
  ok: boolean
  /** New file version, to use for the next save. */
  etag?: string
  /** Server-provided reason when the save failed. */
  error?: string
}

/**
 * Save rendered image bytes back to the file.
 *
 * `etag` is the version the image was loaded from; the server refuses the save
 * when the file has changed since, so a stale editor cannot overwrite someone
 * else's work.
 *
 * `dataUrl` must be a `data:image/png;base64,...` or JPEG/WEBP URL: the server
 * validates the prefix and the decoded bytes.
 */
export async function saveFile(
  fileId: number | string,
  etag: string,
  dataUrl: string,
): Promise<SaveResult> {
  try {
    const response = (await axios.post(
      generateUrl('/apps/photo_editor/api/save/{fileId}', { fileId: String(fileId) }),
      { image: dataUrl, etag },
    )) as { data: SaveResponse }

    return { ok: true, etag: response.data?.etag }
  } catch (err) {
    return { ok: false, error: await extractErrorMessage(err) }
  }
}

/**
 * Read the `error` field Nextcloud's DataResponse carries on a failed request.
 */
async function extractErrorMessage(err: unknown): Promise<string | undefined> {
  const data = (err as { response?: { data?: unknown } } | null)?.response?.data

  let parsed: unknown = data
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data)
    } catch {
      parsed = undefined
    }
  }

  const message = (parsed as { error?: unknown } | undefined)?.error
  return typeof message === 'string' && message !== '' ? message : undefined
}
