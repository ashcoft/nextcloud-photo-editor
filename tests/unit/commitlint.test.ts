/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import { execFileSync } from 'child_process'
import path from 'path'

// Run the real commitlint CLI, the same command the commitlint workflow uses,
// so the assertions exercise the config as loaded rather than a reimplementation
// of it. `--strict` exits non-zero on warnings too.
const CLI = require.resolve('commitlint/cli.js')
const REPO_ROOT = path.resolve(__dirname, '../..')

function lint(message: string): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [CLI, '--strict'], {
      cwd: REPO_ROOT,
      input: message,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { code: 0, output }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return {
      code: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    }
  }
}

// Dependabot's real wording: start-case subject, and a header past 100 characters
// because it carries both full SHAs.
const SHA_A = 'f3bbb056a1b2c3d4e5f60718293a4b5c6d7e8f90'
const SHA_B = '33d7b85b1a2c3d4e5f60718293a4b5c6d7e8f901'
const DEPENDABOT_BUMP = `chore(actions): Bump github/codeql-action/init from ${SHA_A} to ${SHA_B}`
const DEPENDABOT_GROUP = 'chore(deps): Bump the vue-dependencies group with 2 updates'

describe('commitlint exemption for updater commits', () => {
  it('accepts Dependabot\'s unmodified bump commit', () => {
    expect(lint(DEPENDABOT_BUMP).code).toBe(0)
  })

  it('accepts Dependabot\'s grouped update commit', () => {
    expect(lint(DEPENDABOT_GROUP).code).toBe(0)
  })

  it('relaxes the rules only for the updater prefix, not for every commit', () => {
    // Same wording, one character off the exempted scope: the sentence-case
    // subject must fail again, proving the relaxation is scoped to the prefix.
    const result = lint(DEPENDABOT_GROUP.replace('chore(deps)', 'chore(depsx)'))
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('subject-case')
  })

  it('still rejects a human commit with a start-case subject', () => {
    const result = lint('feat: Add Support For Layers')
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('subject-case')
  })

  it('still applies the other rules to an updater commit', () => {
    // A type outside type-enum is not one of the two relaxed rules, so a commit
    // that merely borrows the prefix is still rejected.
    const result = lint('bogus(actions): Bump x from a to b')
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('type-enum')
  })

  it('still enforces body formatting on an updater commit', () => {
    // A blanket `ignores` entry suppressed warnings like this one; the delegated
    // rules must keep reporting them.
    const result = lint(`${DEPENDABOT_GROUP}\nbody without a leading blank line\n`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('body-leading-blank')
  })
})
