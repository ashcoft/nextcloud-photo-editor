# Agent Instructions for Photo Editor

This document provides instructions and tips for AI agents working on this repository. Read this before
making changes. FOLLOW GUIDANCE AS CLOSELY AS POSSIBLE.

## Project Overview

This is a Nextcloud app called `photo_editor` that edits raster photos and opens Photoshop PSD/PSB
documents entirely in Nextcloud 34–35. The browser does all rendering; the PHP backend resolves files,
streams bytes to the browser, writes edited image bytes back under an etag-checked lock, stores
previews, and persists settings.

It is modelled on two projects:

- [ashcoft/nextcloud-cad-viewer](https://github.com/ashcoft/nextcloud-cad-viewer) — the app skeleton,
  PHP layering, file API, thumbnail cache, and build tooling.
- [storytold/photocraft](https://github.com/storytold/photocraft) — the editing model and PSD handling.

## Technical Stack

- **Backend:** PHP ^8.4
- **Nextcloud compatibility:** Target Nextcloud 34 (`nextcloud/ocp:dev-stable34`)
- **Frontend:** Vue 3 with TypeScript
- **Build tool:** Webpack
- **Tests:** PHPUnit (backend), Jest (frontend)

## Prerequisites

- **Node.js:** >= 24
- **pnpm:** >= 10 (run through `corepack` if it is not on `PATH`)
- **PHP:** >= 8.4, with GD

---

## Backend (PHP)

The backend follows Nextcloud app conventions with a layered architecture.

### Layers

| Layer | Lives in | Responsibility |
| --- | --- | --- |
| **Controllers** | `lib/Controller/` | Handle HTTP requests, parse input, call services, format responses |
| **Services** | `lib/Service/` | Business logic. Assume the caller is already authenticated |
| **Listeners** | `lib/Listener/` | React to system events |
| **Preview** | `lib/Preview/` | Serve browser-rendered previews |
| **Config** | `lib/Config/` | App-wide settings |

### Cross-layer Rules

- **Don't reach across layers.** Controllers do not access files or the database directly.
- **Keep controllers thin.** Delegate business logic to services.
- **Use Nextcloud APIs.** Prefer OCP APIs over raw PHP for portability.
- **No magic container lookups.** Inject every collaborator through the constructor, including
  `ThumbnailService`. `\OCP\Server::get()` inside a method is not acceptable.

### Static Analysis

PHPStan (level 5) and Psalm (level 4) must both pass with **zero errors**. They are configured in
`phpstan.neon` and `psalm.xml`.

Classes from other apps (`OCA\Files\Event\...`) and private server classes (`OC\...`) are provided as
stubs under `tests/stubs/static-analysis/`, listed in `scanFiles` / `<stubs>`. Do not add `@phpstan-ignore`
or baseline entries to silence a real problem — fix the underlying type.

---

## Frontend (Vue 3 + TypeScript)

Located in `src/`. Follow the Vue 3 Composition API.

### Editor Core (`src/editor/`)

The editor is PhotoCraft's web build, embedded in a same-origin iframe; it is not code maintained here.
`src/editor/` holds only the bridge to it and the format helpers:

| File | Responsibility |
| --- | --- |
| `editor/photocraftBridge.ts` | Open a file in the editor, and capture what it saves |
| `editor/psdThumbnail.ts` | Render a Files-grid preview from Photoshop bytes |
| `editor/psd/` | PSD/PSB reader and compositor, used only for those previews |
| `editor/mimeTypes.ts` | Extensions and MIME types the app recognises |

#### Invariants to preserve

- **The bridge drives the editor's own interfaces.** A file is opened by dispatching the same HTML5 drop
  a user's drag produces, and a save is captured by wrapping `URL.createObjectURL` and the anchor click
  inside the frame. PhotoCraft publishes no host API, so these are the seams; keep both in one module so
  a change to either is a single edit.
- **The e2e test is the contract.** `tests/e2e/photocraftBridge.spec.ts` drives the real bridge against
  the real bundle. Any bump of the vendored version must keep it passing, because nothing else proves the
  editor still accepts a drop or still emits a save.
- **The bridge is framework-free.** It is plain TypeScript over DOM APIs; Vue calls into it, and it must
  not import from Vue.
- **Rendering belongs to PhotoCraft.** Do not reintroduce a canvas rendering pipeline here; the app's job
  is to move bytes in and out of the embedded editor.

### The vendored editor

`photocraft/` is a vendored third-party build, fetched and committed. It is **not** source to edit:
regenerate it with `scripts/fetch-photocraft.sh`, which pins the version and verifies the release
checksum. To upgrade, run `scripts/bump-photocraft.sh`, which rewrites `PHOTOCRAFT_VERSION` and
`PHOTOCRAFT_SHA256` together, re-runs the fetcher, and then confirm the e2e test still passes.

Because the pin is a shell variable rather than a package dependency, neither Renovate nor Dependabot
can see it. `.github/workflows/photocraft-update.yml` runs `scripts/bump-photocraft.sh` on a schedule
and opens a pull request with the result, which is how a new upstream release reaches this repository.

`PhotocraftBundleService` serves it and refuses any path that would leave the bundle directory;
`PhotocraftController` sets `application/wasm` on the module, which a browser requires.

### File Conventions

- **Naming:** `PascalCase` for components and types, `camelCase` for utilities
- **Tests:** Jest tests go in `tests/unit/`, named `*.test.ts`
- **Reuse types before inventing them.** Search `src/types/` and `src/editor/` first

### Comments

Keep comments light. Prefer self-documenting code. Add a comment **only** when:

- The _why_ is non-obvious (a workaround, a subtle invariant, a byte-layout detail)
- A non-trivial usage detail would trip the next reader

Don't restate what the code already says, and don't narrate the change history.

---

## Dependencies

| Type | Manager | Command |
| --- | --- | --- |
| Backend | Composer | `composer install` |
| Frontend | pnpm | `pnpm install` |

`vendor/` and `vendor-bin/nextcloud-ocp/vendor/` are **not** committed: they are regenerated by
`composer install` locally and by the release job. Never commit them.

The PSD reader has **no runtime dependencies** — it is written from the specification against the browser's
own APIs. Do not add a PSD library; that is the point of the module.

---

## Testing

### Backend (PHPUnit)

```bash
composer test:unit
```

Tests are run with `--fail-on-warning --fail-on-risky --fail-on-deprecation --fail-on-notice`, so a test
that produces a PHPUnit notice fails the suite. Use
`#[AllowMockObjectsWithoutExpectations]` on a class whose mocks have no expectations.

Prefer a small real fixture (`tests/Fixtures/`) over a mock when the behaviour under test depends on state
— the `ThumbnailService` tests use an in-memory app-data tree precisely so that a stored thumbnail is one
that can be read back.

### Frontend (Jest)

```bash
pnpm test
```

jsdom has no canvas implementation, so `getContext('2d')` returns `null` in tests. Test the pure logic
(parsing, adjustments, filters, transforms, history) directly, and test canvas-touching code through its
documented null-context behaviour.

The PSD tests use a fixture builder (`tests/unit/psdFixture.ts`) that writes spec-correct PSD bytes, so
the reader is exercised on real structure rather than a bespoke format.

### Updater script (bash)

```bash
pnpm run test:scripts
```

`tests/scripts/bump-photocraft.test.sh` covers `scripts/bump-photocraft.sh`. It stubs `curl` and the
fetcher, so it needs no network, and exercises the real validation, release resolution, checksum
selection, pin rewrite and failure restore. The `photocraft-bundle` workflow runs it alongside the
bundle check.

### Static Analysis

```bash
composer psalm        # Psalm
composer phpstan      # PHPStan
composer cs:check     # php-cs-fixer, dry run
pnpm run lint         # ESLint
pnpm run stylelint    # Stylelint
pnpm run check-types  # vue-tsc
pnpm run test:e2e     # Playwright, real browser
```

All of these must pass cleanly before a change is finished.

---

## Continuous integration

Workflows live in `.github/workflows/`. Most are the Nextcloud organization templates and are kept in
sync by the `Update workflows` workflow, so prefer changing behaviour through the app's own config
(`phpstan.neon`, `psalm.xml`, `package.json` scripts) over editing a template in place. `phpstan.yml`
and `psalm.yml` assert the PHP version pins (`phpVersion: 80400`, `phpVersion="8.4"`), so those two
values are load-bearing.

The `phpunit-*` workflows install the app into a real Nextcloud checkout and enable it with `occ`, so a
change that only works in isolation will fail there even when the unit suite passes.

### Action pinning

Third-party actions are pinned to a full commit SHA, with the release it corresponds to in a trailing
comment:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

The SHA is what actually runs, so it is the thing that has to be reviewed. A mutable tag can be moved
to point at different code without any change here; the `shivammathur/setup-php` `v2` reference in this
repository's history illustrates why a mutable tag is not a reliable pin.

Pinned actions are kept current by Renovate and Dependabot, which raise update pull requests on a
schedule rather than for every release. That is the update path, so a pinned SHA is not a decision to
freeze the action — review the changelog on the pull request and merge it as usual. Both bots cap how
many pull requests they keep open (`open-pull-requests-limit` for Dependabot, `prConcurrentLimit` for
Renovate), so an update can wait unproposed; Renovate's Dependency Dashboard lists those pending, which
is where to look when no pull request has arrived. Do not replace a SHA with a tag to make a diff read
more clearly; add the version in the comment instead.

`AI_POLICY.md` is the Nextcloud AI Contribution Policy as it applies to this app. `.github/CONTRIBUTING.md` summarises
what it requires of this repository, and `.github/PULL_REQUEST_TEMPLATE.md` carries the disclosure
section. Keep all three in step when the policy changes.

---

## Release

`make bump-version VERSION=x.y.z` updates both `appinfo/info.xml` and `package.json`. `make appstore`
builds the release archive. Keep the two version numbers in step — `version-check.yml` enforces it.

The `release` workflow runs semantic-release, which reads conventional commits and bumps both version
files through `make bump-version`. Release-worthy types are `feat`, `perf`, `fix` and `fix(deps)`;
`chore`, `docs`, `test`, `ci` and `refactor` do not cut a release. The rules and the reasoning behind
them are in `release.config.js`.
