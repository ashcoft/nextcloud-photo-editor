/* SPDX-FileCopyrightText: 2026 Photo Editor Contributors */
/* SPDX-License-Identifier: MIT */

const FileType = { File: 'file', Folder: 'folder' }
const DefaultType = { DEFAULT: 0, HIDDEN: 1 }

module.exports = {
  FileType,
  DefaultType,
  registerFileAction: jest.fn(),
  getFileActions: jest.fn(() => []),
  getNavigation: jest.fn(() => null),
  registerNavigation: jest.fn(),
}
