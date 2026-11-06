/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

/**
 * Upload a thumbnail for the file the editor has open.
 *
 * `etag` is the version of the file the thumbnail was rendered from. The
 * server stores the image under it and rejects uploads for a version the file
 * has already moved past, so an edit made while the image was open cannot end
 * up as the preview of the newer version.
 *
 * Failures are swallowed: thumbnails are a progressive enhancement and must
 * never surface an error to the user.
 */
export async function uploadThumbnail(
  etag: string | undefined,
  dataUrl: string | null,
  options: { fileId?: number | string; signal?: AbortSignal } = {},
): Promise<void> {
  if (!dataUrl || options.signal?.aborted || options.fileId === undefined) {
    return
  }

  try {
    await axios.post(
      generateUrl('/apps/photo_editor/api/thumbnail/{fileId}', { fileId: String(options.fileId) }),
      { image: dataUrl, etag: etag ?? '' },
      { signal: options.signal },
    )
  } catch {
    // Ignore: the generic file icon stays until a thumbnail is available.
  }
}
