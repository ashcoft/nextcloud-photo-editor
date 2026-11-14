/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

const nxConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'nx.json'), 'utf8'))
const build = nxConfig.targetDefaults.build
const makefile = fs.readFileSync(path.join(ROOT, 'Makefile'), 'utf8')
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')

/**
 * Nx caches the build target. The cache is only correct if it knows what the
 * build writes and what it reads; both were wrong in the first version of this
 * configuration and neither is caught by running the build once.
 */
describe('nx build target', () => {
  it('caches the webpack output directory', () => {
    // Webpack writes the bundles to `js/`. Without this the target declares no
    // outputs, so a cache hit restores nothing and `nx build` reports success
    // while the bundles are missing.
    expect(build.outputs).toContain('{projectRoot}/js')
  })

  it('keeps the source files as inputs', () => {
    // An `inputs` list replaces the defaults rather than adding to them, so a
    // list holding only the env entries would leave a source edit a cache hit
    // and serve stale bundles.
    expect(build.inputs).toContain('default')
  })

  it('invalidates on the environment babel switches on', () => {
    // babel.config.js picks its preset target from NODE_ENV/BABEL_ENV, so a
    // cached production build must not be reused for a test build.
    expect(build.inputs).toContainEqual({ env: 'NODE_ENV' })
    expect(build.inputs).toContainEqual({ env: 'BABEL_ENV' })
  })
})

describe('release staging', () => {
  it('excludes the local Nx cache from the app archive', () => {
    // `make stage` copies with rsync, which honours these exclusions and not
    // .gitignore, so the cache would otherwise ship in every release archive.
    expect(makefile).toMatch(/--exclude='\.nx'/)
  })
})

describe('.gitignore', () => {
  it('ignores the Nx cache directory', () => {
    expect(gitignore).toMatch(/^\.nx\/$/m)
  })
})
