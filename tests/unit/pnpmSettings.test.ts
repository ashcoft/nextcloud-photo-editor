/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const WORKSPACE = path.join(ROOT, 'pnpm-workspace.yaml')

/**
 * pnpm 12 reads its settings from pnpm-workspace.yaml and ignores .npmrc, so a
 * setting left in .npmrc is silently dropped and the built-in default applies.
 * That happened to `minimumReleaseAge`: the guard moved to the workspace file
 * for `overrides` and `allowBuilds` but the release-age entry did not come with
 * it, so pnpm fell back to its 1440-minute default and rejected the lockfile
 * entries Renovate had just written. Every frontend CI job died at install.
 */
describe('pnpm settings', () => {
  const workspace = fs.readFileSync(WORKSPACE, 'utf8')

  it('disables the release-age guard in the file pnpm 12 reads', () => {
    // A non-zero value here rejects a lockfile entry the dependency bots have
    // just resolved, which fails `pnpm install --frozen-lockfile` in CI.
    expect(workspace).toMatch(/^minimumReleaseAge:\s*0\s*$/m)
  })

  it('does not leave settings in .npmrc, which pnpm 12 ignores', () => {
    // A `.npmrc` would look like it configures pnpm while having no effect, so
    // the next setting added there would silently regress the same way.
    expect(fs.existsSync(path.join(ROOT, '.npmrc'))).toBe(false)
  })
})
