/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

import fs from 'fs'
import path from 'path'

const WORKFLOW = path.resolve(__dirname, '../../.github/workflows/rector.yml')

// The workflow runs on a schedule, so a step that fails before Rector is
// reached stays invisible until the next Sunday. Guard at PR time the two
// properties the failing run violated.
const workflow = fs.readFileSync(WORKFLOW, 'utf8')

// `composer bin` is a bamarni/composer-bin-plugin subcommand, and the plugin
// only exists once `composer install` has populated vendor/. Invoked before the
// install it aborts with `Command "bin" is not defined.`; invoked after, it
// rewrites the tracked vendor-bin/nextcloud-ocp/composer.json and .lock, which
// the create-pull-request step then commits. Neither belongs in this workflow.
const COMPOSER_BIN = /composer\s+bin\b/
const COMPOSER_INSTALL = /composer\s+(i|install)\b/
const RECTOR = /composer\s+run\s+rector\b/

describe('rector workflow', () => {
  it('installs dependencies before running rector', () => {
    const install = workflow.search(COMPOSER_INSTALL)
    const rector = workflow.search(RECTOR)

    // Guard the parse: if either command is reworded and stops matching, the
    // ordering assertion below would pass vacuously.
    expect(install).toBeGreaterThan(-1)
    expect(rector).toBeGreaterThan(-1)
    expect(install).toBeLessThan(rector)
  })

  it('does not run the composer bin plugin command', () => {
    expect(workflow).not.toMatch(COMPOSER_BIN)
  })
})
