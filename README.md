# Photo Editor

[![Latest Release](https://img.shields.io/github/v/release/ashcoft/nextcloud-photo-editor)](https://github.com/ashcoft/nextcloud-photo-editor/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Nextcloud Version](https://img.shields.io/badge/Nextcloud-34--35-blue)](https://nextcloud.com)
[![PHP Version](https://img.shields.io/badge/PHP-8.4-purple)](https://php.net)
[![Node Version](https://img.shields.io/badge/Node-%E2%89%A524-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Powered by PhotoCraft](https://img.shields.io/badge/Powered%20by-PhotoCraft%200.23.1-2f7bf5)](https://github.com/storytold/photocraft)

[![Node tests](https://img.shields.io/github/actions/workflow/status/ashcoft/nextcloud-photo-editor/node-test.yml?label=tests)](https://github.com/ashcoft/nextcloud-photo-editor/actions/workflows/node-test.yml)
[![E2E tests](https://img.shields.io/github/actions/workflow/status/ashcoft/nextcloud-photo-editor/e2e.yml?label=e2e)](https://github.com/ashcoft/nextcloud-photo-editor/actions/workflows/e2e.yml)
[![Coverage](https://codecov.io/gh/ashcoft/nextcloud-photo-editor/branch/main/graph/badge.svg)](https://codecov.io/gh/ashcoft/nextcloud-photo-editor)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=ashcoft_photo-editor&metric=alert_status)](https://sonarcloud.io/dashboard?id=ashcoft_photo-editor)

A native Nextcloud app for editing photos and Photoshop PSD documents, built on
[PhotoCraft](https://github.com/storytold/photocraft) — an open-source, clean-room reimplementation of
Adobe Photoshop in Rust.

The app is a thin PHP backend that resolves files, streams them to the browser, and stores previews, paired with a
Vue 3 front end. The editor itself is PhotoCraft's web build, embedded in an iframe and driven by a small
bridge, so layers, masks, adjustment layers, type, vectors, brushes and PSD read/write come from upstream
rather than from code maintained here.

- **Supported formats:** PSD, PSB, PNG, JPEG, WEBP, GIF, BMP
- **Nextcloud:** 34 – 35
- **PHP:** 8.4+

## Features

### Editing

Everything PhotoCraft offers, in the browser:

- Layers, groups, masks, clipping masks and 27 blend modes
- 16 adjustment layers, including Curves with per-channel editing and Levels with a live histogram
- Layer styles, editable type, vector shapes and a full brush engine
- Selections, filters with live preview, free transform and a full history
- 8, 16 and 32-bit documents in RGB, Grayscale, CMYK and Lab

### Integration

- A Photoshop document opens in the editor on a single click: the app is its default viewer
- Other images open through **Open with Photo Editor** in the file's actions menu, so Nextcloud's
  own viewer stays the default for them
- The file is handed to the editor through the same drop interface a drag uses, so no temporary copy
  is written to the server
- **Save** writes the editor's output back to the file under the etag lock, so a stale editor cannot
  overwrite someone else's work
- **Export** inside the editor downloads a copy without touching the stored file; the app only takes
  over a produced file it can store (a Photoshop document for a Photoshop target)
- Preview thumbnails in the Files grid: the browser renders them for PSD files and caches them
  server-side, while raster formats keep using Nextcloud's own previews
- Start page with recent images
- Admin settings for theme, previews and maximum file size

PSD and PSB round-trip: the editor saves a layered Photoshop document, which the app writes back under
the etag lock. The raster formats it opens (PNG, JPEG, WEBP, GIF, BMP) are opened for editing and their
output is downloaded, because PhotoCraft saves every document as a PSD and that cannot replace a raster
file under its own name.

AVIF is not offered: the vendored PhotoCraft build documents AVIF decoding as unavailable.

## Architecture

```
appinfo/           App metadata, routes, MIME types
lib/               PHP backend
  AppInfo/         Application bootstrap and format helpers
  Config/          App-wide settings
  Controller/      HTTP endpoints (pages, files, bundle, admin settings)
  Listener/        Load the front end, clean up thumbnails
  Migration/       Register the Photoshop MIME types
  Preview/         Serve browser-rendered previews
  Service/         File resolution, thumbnails, recent images, the vendored bundle
photocraft/        Vendored PhotoCraft web build (fetched and committed)
scripts/           fetch-photocraft.sh: download and verify a pinned release
src/               Vue 3 front end
  editor/          The bridge to the embedded editor, and format helpers
  utils/           Nextcloud API helpers
  App.vue          Editor host: toolbar, iframe, status
  StartPage.vue    Start page
templates/         PHP templates the Vue components mount into
css/               Stylesheet entry points
tests/             PHPUnit (backend), Jest (front end) and Playwright (browser) suites
```

### How a file is opened

1. The file action navigates to `/apps/photo_editor/view?fileIds=<id>`.
2. `FileController::load` resolves the id against the user's own folder, validates the type and size, and
   returns metadata plus a session-authenticated download URL.
3. The browser fetches the bytes through that URL.
4. The host page hands the bytes to the embedded editor through the bridge, which dispatches the same
   drop a user's drag would. Nothing is written to the server to open a file.
5. `PhotocraftController::asset` serves the editor bundle itself, with `application/wasm` on the module.

### How a save works

The editor's Save produces a file in the browser. The bridge intercepts the download the editor would
have started and gives the bytes to the host, which posts them as a base64 data URL together with the
etag it loaded. The server takes an exclusive lock on the file, **re-checks the etag inside the lock**,
and only then writes. Two saves based on the same version therefore cannot both succeed: the second sees
the new etag and is refused with `409`. This is the same pattern the CAD Viewer app uses.

A Photoshop document is accepted by its `8BPS` signature rather than by GD, which cannot read one. The
header's channel count and bit depth are checked against the ranges the format defines, and its
dimensions against the same edge and pixel caps the raster path uses.

## The embedded editor

PhotoCraft is a Rust/WASM application, not a library, so it is integrated by embedding it rather than by
importing an API:

- `photocraft/` holds the vendored web build, currently PhotoCraft 0.23.1.
  `scripts/fetch-photocraft.sh` downloads the pinned release and verifies its SHA-256, so the tree can be
  regenerated and audited.
- `PhotocraftController` serves it, and `PhotocraftBundleService` refuses any path that would leave the
  bundle directory.
- `src/editor/photocraftBridge.ts` is the bridge: a drop to open a file, and an interception of the
  editor's download to capture a save.

Both directions depend on interfaces PhotoCraft does not promise to keep, so
`tests/e2e/photocraftBridge.spec.ts` drives the real bridge against the real bundle in a browser and fails
if a PhotoCraft upgrade changes how it accepts a drop or emits a save. **Any bump of the vendored version
must keep that test passing.**

PhotoCraft is MIT OR Apache-2.0; its licences ship in `photocraft/`.

## Requirements

- Nextcloud 34 or 35
- PHP 8.4 or newer, with the GD extension (for preview validation)
- Node.js 24 or newer and pnpm 10 or newer (to build the front end)

## Installation

### From a release archive

Download the archive from the releases page, extract it into your `apps` directory, and enable it:

```bash
occ app:enable photo_editor
```

### From source

```bash
git clone https://github.com/ashcoft/nextcloud-photo-editor.git
cd nextcloud-photo-editor

# Front end
corepack enable
pnpm install
pnpm run build

# Back end (only needed to run the tests or static analysis)
composer install

# Place the app in Nextcloud and enable it
ln -s "$(pwd)" /path/to/nextcloud/apps/photo_editor
occ app:enable photo_editor
```

## Configuration

Settings live under **Administration settings → Photo Editor**.

| Setting | Default | Meaning |
| --- | --- | --- |
| Theme | Light | Theme the editor opens with |
| Enable file previews | Yes | Whether thumbnails may be rendered and stored |
| Maximum file size (MB) | 50 | Largest file the editor will open, 1–512 |

## Development

```bash
pnpm run dev          # webpack watch
pnpm run build        # production bundle
pnpm test             # Jest (front end)
pnpm run test:coverage
pnpm run test:e2e     # Playwright (front end, real browser)
pnpm run lint         # ESLint
pnpm run stylelint    # Stylelint
pnpm run check-types  # vue-tsc

composer test:unit    # PHPUnit (back end)
composer psalm        # Psalm
composer phpstan      # PHPStan
composer rector       # Rector (applies changes; the workflow runs it in a PR)
composer cs:check     # php-cs-fixer, dry run
composer lint         # php -l over every PHP file
```

`make test` and `make lint` run the front-end and back-end suites together. `make appstore` produces a
release archive in `build/artifacts`.

See [AGENTS.md](AGENTS.md) for the conventions this repository follows.

## Continuous integration

Every workflow lives in `.github/workflows/`. Most are the Nextcloud organization templates, kept in
sync by the `Update workflows` workflow.

| Workflow | What it runs |
| --- | --- |
| `lint-php` | `php -l` on every supported PHP version |
| `lint-php-cs` | php-cs-fixer, dry run |
| `lint-info-xml` | `appinfo/info.xml` against the App Store schema |
| `lint-eslint` | ESLint |
| `lint-typescript` | vue-tsc |
| `lint-stylelint` | Stylelint |
| `phpstan` | PHPStan |
| `psalm`, `psalm-matrix` | Psalm, against each supported OCP version |
| `node-test` | Jest, with coverage uploaded to Codecov |
| `phpunit-sqlite`, `phpunit-mariadb`, `phpunit-oci` | PHPUnit against a real Nextcloud on each database |
| `e2e` | Playwright against the built bundle |
| `codeql` | CodeQL for the Actions and TypeScript sources |
| `version-check` | `appinfo/info.xml` and `package.json` versions agree |
| `photocraft-bundle` | the committed editor bundle matches the pinned PhotoCraft release |
| `release` | semantic-release, then build and attach the app archives |
| `rector`, `update-nextcloud-ocp`, `pnpm-audit`, `renovate`, `photocraft-update` | Scheduled dependency and code maintenance |

`phpunit-*` install the app into a real Nextcloud server checkout and run it with
`occ app:enable`, so the app is exercised against the framework rather than only in isolation.

## Security

- Every file access goes through the user's own folder, so a file id a user cannot see is never returned
- Downloads are session-authenticated; the client never receives a second credential
- Saves are protected by an etag check under an exclusive lock
- The editor bundle is served from a fixed directory, and a request path that would leave it is refused
- Thumbnail uploads are validated by content, not by the data URL prefix, and capped in both byte size
  and decoded dimensions
- Thumbnails can only be set by users who may modify the file
- Admin settings are restricted with `AuthorizedAdminSetting`

## License

MIT. See [LICENSE](LICENSE).

The embedded editor is [PhotoCraft](https://github.com/storytold/photocraft), by Storytold and
contributors, licensed MIT OR Apache-2.0. Its licence files and attribution ship with the vendored build
in `photocraft/`.
