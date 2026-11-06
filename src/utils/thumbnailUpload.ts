/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

/**
 * Render and upload a thumbnail for an image so the Files app can show it.
 *
 * `etag` is the version of the file the editor rendered. The server stores the
 * image under it and rejects uploads for a version the file has already moved
 * past, so an edit made while the image was open cannot end up as the preview
 * of the newer version.
 *
 * Failures are swallowed: thumbnails are a progressive enhancement and must
 * never surface an error to the user.
 */
export async function uploadThumbnail(
  fileId: number | string,
  etag: string | undefined,
  dataUrl: string | null,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  if (!dataUrl || options.signal?.aborted) {
    return
  }

  try {
    await axios.post(
      generateUrl('/apps/photo_editor/api/thumbnail/{fileId}', { fileId: String(fileId) }),
      { image: dataUrl, etag: etag ?? '' },
      { signal: options.signal },
    )
  } catch {
    // Ignore: the generic file icon stays until a thumbnail is available.
  }
}
