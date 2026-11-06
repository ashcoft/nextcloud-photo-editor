/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * An image listed on the start page.
 *
 * Produced by `RecentImagesService` on the server and embedded into the page
 * as JSON, so the shape must stay in sync with that service.
 */
export interface RecentImage {
  id: number
  name: string
  /** Path relative to the user's files root, e.g. `/Pictures/cat.png`. */
  path: string
  /** Lower-case file extension. */
  extension: string
  /** Modification time as a Unix timestamp in seconds. */
  mtime: number
  /** Whether the file is a Photoshop document. */
  isPsd: boolean
}
