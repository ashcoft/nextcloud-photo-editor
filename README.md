# Photo Editor

A native Nextcloud app for editing photos and opening Photoshop PSD documents, in the spirit of
[PhotoCraft](https://github.com/storytold/photocraft) — an open-source, clean-room image editor.

The app follows the structure of [Nextcloud CAD Viewer](https://github.com/ashcoft/nextcloud-cad-viewer):
a thin PHP backend that resolves files, streams them to the browser, and stores previews, paired with a
Vue 3 front end that does all rendering client-side.

- **Supported formats:** PSD, PSB, PNG, JPEG, WEBP, GIF, BMP, AVIF
- **Nextcloud:** 34 – 35
- **PHP:** 8.4+

## Features

### PSD and PSB

- Opens layered PSD and PSB documents, including 16- and 32-bit files
- Renders the merged image Photoshop stored in the file, so effects the editor does not model still appear
- Falls back to a real layer composite (bounds, opacity, blend mode, visibility) when there is no merged image
- Shows the layer tree with names, blend modes and group nesting
- Handles raw, RLE (PackBits) and ZIP channel compression, with and without prediction

### Editing

- Colour adjustments: brightness, contrast, saturation, exposure, temperature, hue, gamma
- Filters: grayscale, sepia, invert, blur, sharpen, auto contrast
- Transforms: crop, rotate 90/180/270, flip, resize
- Undo/redo history over the last 100 edits, with a reset that discards every change at once

Every edit is non-destructive: the decoded source is never modified, and rendering is a pure function
of the source plus the current edit state. That is what makes undo and the live preview cheap.

### Integration

- **Open with Photo Editor** file action in the Files app
- Preview thumbnails in the Files grid: the browser renders them for PSD files and caches them
  server-side, while raster formats keep using Nextcloud's own previews
- Start page with recent images
- Save back to PNG and JPEG, with optimistic-concurrency protection; the other formats it opens
  are exported instead, because a canvas re-encodes them as PNG
- Export the current view as a download
- Admin settings for theme, previews and maximum file size
- Dark and light themes, responsive layout, works on desktop and mobile

PSD and PSB files are **read-only** in the editor: the app does not re-encode the layer stack, so a save
would silently flatten the document. The editor offers Export instead, and the server refuses such a save.

## Architecture

```
appinfo/           App metadata, routes, MIME types
lib/               PHP backend
  AppInfo/         Application bootstrap and format helpers
  Config/          App-wide settings
  Controller/      HTTP endpoints (pages, files, admin settings)
  Listener/        Load the front end, clean up thumbnails
  Migration/       Register the Photoshop MIME types
  Preview/         Serve browser-rendered previews
  Service/         File resolution, thumbnails, recent images
src/               Vue 3 front end
  editor/psd/      PSD/PSB reader and compositor
  editor/engine/   Adjustments, filters, transforms, history, render
  editor/io/       Decoding and encoding
  composables/     Editor state and behaviour
  utils/           Nextcloud API helpers
  App.vue          Editor shell
  StartPage.vue    Start page
templates/         PHP templates the Vue components mount into
css/               Stylesheet entry points
tests/             PHPUnit (backend) and Jest (frontend) suites
```

### How a file is opened

1. The file action navigates to `/apps/photo_editor/view?fileIds=<id>`.
2. `FileController::load` resolves the id against the user's own folder, validates the type and size, and
   returns metadata plus a session-authenticated download URL.
3. The browser fetches the bytes through that URL.
4. `src/editor/io/loadDocument.ts` routes to the PSD reader or the browser's own image decoder.
5. The editor renders the result into a canvas and paints it into the page.

### How a save works

The client posts a base64 data URL of the rendered image together with the etag it loaded. The server
takes an exclusive lock on the file, **re-checks the etag inside the lock**, and only then writes. Two
saves based on the same version therefore cannot both succeed: the second sees the new etag and is
refused with `409`. This is the same pattern the CAD Viewer app uses.

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
| `release` | semantic-release, then build and attach the app archives |
| `rector`, `update-nextcloud-ocp`, `pnpm-audit`, `renovate` | Scheduled dependency and code maintenance |

`phpunit-*` install the app into a real Nextcloud server checkout and run it with
`occ app:enable`, so the app is exercised against the framework rather than only in isolation.

## Security

- Every file access goes through the user's own folder, so a file id a user cannot see is never returned
- Downloads are session-authenticated; the client never receives a second credential
- Saves are protected by an etag check under an exclusive lock
- Thumbnail uploads are validated by content, not by the data URL prefix, and capped in both byte size
  and decoded dimensions
- Thumbnails can only be set by users who may modify the file
- Admin settings are restricted with `AuthorizedAdminSetting`

## License

MIT. See [LICENSE](LICENSE).

The PSD reader in `src/editor/psd/` is written from Adobe's published PSD specification. It is an
independent implementation and contains no Adobe code.
