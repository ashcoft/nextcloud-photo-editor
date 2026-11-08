/* SPDX-FileCopyrightText: 2026 Photo Editor Contributors */
/* SPDX-License-Identifier: MIT */

const FileType = { File: 'file', Folder: 'folder' }
// The real package uses these string values, not ordinals; a mock that drifted
// from them would let a test pass against behaviour the browser does not have.
const DefaultType = { DEFAULT: 'default', HIDDEN: 'hidden' }

module.exports = {
  FileType,
  DefaultType,
  registerFileAction: jest.fn(),
  getFileActions: jest.fn(() => []),
  getNavigation: jest.fn(() => null),
  registerNavigation: jest.fn(),
}
