/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import fs from 'fs'
import path from 'path'

const LOCKFILE = path.resolve(__dirname, '../../pnpm-lock.yaml')

// The first version that fixes GHSA-g3hv-75wg-m249. The advisory has no fixed
// 9.x or 10.x, so the pnpm override in pnpm-workspace.yaml lifts every
// consumer to this line.
const MINIMATCH_FIRST_PATCHED = '11.0.1'

function parse(version: string): number[] {
  return version.split('.').map(Number)
}

function isBelow(version: string, floor: string): boolean {
  const a = parse(version)
  const b = parse(floor)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

// Collects every minimatch version the lockfile pins, from both the package
// definitions (`minimatch@11.0.5:`) and the dependency references
// (`minimatch: 11.0.5`). A vulnerable copy introduced anywhere shows up in one
// of the two.
function resolvedMinimatchVersions(lockfile: string): string[] {
  const versions = new Set<string>()
  const patterns = [
    /^\s+'?minimatch@(\d+\.\d+\.\d+)'?:/gm,
    /^\s+minimatch:\s+(\d+\.\d+\.\d+)\s*$/gm,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(lockfile)) !== null) {
      versions.add(match[1])
    }
  }
  return [...versions]
}

describe('dependency security overrides', () => {
  const lockfile = fs.readFileSync(LOCKFILE, 'utf8')

  it('resolves every minimatch to the patched line (GHSA-g3hv-75wg-m249)', () => {
    const versions = resolvedMinimatchVersions(lockfile)

    // Guard the parse itself: if the lockfile layout changes and nothing is
    // matched, the assertion below would pass vacuously.
    expect(versions.length).toBeGreaterThan(0)

    const vulnerable = versions.filter(v => isBelow(v, MINIMATCH_FIRST_PATCHED))
    expect(vulnerable).toEqual([])
  })

  it('keeps the override that enforces the minimatch floor', () => {
    // The override is what holds the consumers pinned to ^9/^10 on the patched
    // line; without it they resolve the vulnerable 9.0.9 / 10.2.6 again. Check
    // the target range too, not just the selector: repointing it at a
    // vulnerable range must fail even while the committed lockfile still holds
    // the current resolutions.
    const start = lockfile.indexOf('overrides:')
    const end = lockfile.indexOf('importers:', start)
    expect(start).toBeGreaterThan(-1)
    const overrides = lockfile.slice(start, end === -1 ? undefined : end)

    const mapping = overrides.match(/minimatch@<[\d.]+:\s*(\S+)/)
    expect(mapping).not.toBeNull()
    const target = mapping![1]
    const floor = target.match(/\d+\.\d+\.\d+/)?.[0]
    expect(floor).toBeDefined()
    expect(isBelow(floor!, MINIMATCH_FIRST_PATCHED)).toBe(false)
  })
})
