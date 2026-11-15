/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const composer = JSON.parse(fs.readFileSync(path.join(ROOT, 'composer.json'), 'utf8'))
const psalmScript: string = composer.scripts.psalm

const WORKFLOWS = ['psalm.yml', 'psalm-matrix.yml'].map(name =>
  fs.readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8')
)

// Long options only; a bare `--` separator is not one, so the regex needs a
// following letter.
const longOptions = (text: string): string[] => text.match(/--[a-z][a-z-]*/g) ?? []

// The options a workflow appends to `composer run psalm -- ...`.
function workflowOptions(workflow: string): string[] {
  const line = workflow.split('\n').find(l => l.includes('composer run psalm'))
  if (!line) return []
  const invocation = line.slice(line.indexOf('composer run psalm'))
  return longOptions(invocation.slice(invocation.indexOf('--')))
}

/**
 * The workflows run `composer run psalm -- <options>`, so an option set in the
 * script as well arrives twice. Psalm used to cast the repeated option to int
 * and run anyway; from 7.6.0 it validates the value and exits 1 with
 * `--threads expects a positive integer or "auto"`, which failed every static
 * analysis job before any code was analysed.
 */
describe('psalm invocation', () => {
  it('does not repeat an option the workflows already pass', () => {
    const scriptOptions = longOptions(psalmScript)

    // Guard the parse: a reworded script that matches nothing would make the
    // comparison below pass vacuously.
    expect(scriptOptions.length).toBeGreaterThan(0)

    for (const workflow of WORKFLOWS) {
      const passed = workflowOptions(workflow)
      expect(passed.length).toBeGreaterThan(0)

      const duplicated = passed.filter(option => scriptOptions.includes(option))
      expect(duplicated).toEqual([])
    }
  })
})
