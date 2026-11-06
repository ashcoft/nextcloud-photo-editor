/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * The metadata the server returns for a file the editor is about to open.
 */
export interface LoadResponse {
  id: number
  name: string
  size: number
  mimeType: string
  path: string
  /** User-visible folder the file lives in, for "back to Files" links. */
  directory: string
  /** Version of the file the metadata was read from. */
  etag: string
  /** Whether the image can be written back. */
  canSave: boolean
  /** Whether the source is a Photoshop document. */
  isPsd: boolean
  /** Direct download URL for the file. */
  url: string
  /** Editor theme chosen by the administrator. */
  theme: 'light' | 'dark'
  contentType: string
  /** Largest payload the server will accept, in bytes. */
  maxFileSize: number
  error?: string
}
