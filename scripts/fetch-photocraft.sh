#!/usr/bin/env bash
#
# Fetch the pinned PhotoCraft web build into ./photocraft.
#
# PhotoCraft is a third-party Rust/WASM application (MIT OR Apache-2.0) that the
# editor embeds. It is vendored rather than built here: building it needs the
# Rust toolchain and Trunk, and the release archive is the supported artefact.
# This script is the upgrade path - bump PHOTOCRAFT_VERSION and PHOTOCRAFT_SHA256
# together, run it, and commit the result.
#
# The upstream zip ships `snippets/` at the site root while the app's glue asks
# for `app/snippets/...`; the copy step mirrors it into both places so the
# request resolves. Upstream's own deployment 404s there too, so this is a
# packaging quirk rather than a version-specific break.
set -euo pipefail

PHOTOCRAFT_VERSION="0.22.0"
PHOTOCRAFT_SHA256="597c4ffc54eca20d944a292b54ef7b6a3a1fd20725c42396eee00adebef3ebd9"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${repo_root}/photocraft"
url="https://github.com/storytold/photocraft/releases/download/v${PHOTOCRAFT_VERSION}/photocraft-web-${PHOTOCRAFT_VERSION}.zip"

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

echo "Downloading ${url}"
# Pin the protocol so a redirect cannot downgrade the download to plain HTTP.
curl -fsSL --proto '=https' --tlsv1.2 "${url}" -o "${work}/photocraft-web.zip"

# `sha256sum` is GNU coreutils; macOS ships `shasum` instead, and a contributor
# bumping the pin on a Mac should not have to install anything.
if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "${work}/photocraft-web.zip" | cut -d' ' -f1)"
else
    actual="$(shasum -a 256 "${work}/photocraft-web.zip" | cut -d' ' -f1)"
fi
if [[ "${actual}" != "${PHOTOCRAFT_SHA256}" ]]; then
    echo "ERROR: checksum mismatch for photocraft-web-${PHOTOCRAFT_VERSION}.zip" >&2
    echo "  expected ${PHOTOCRAFT_SHA256}" >&2
    echo "  actual   ${actual}" >&2
    exit 1
fi

unzip -q "${work}/photocraft-web.zip" -d "${work}/unpacked"

source="${work}/unpacked/photocraft-web-${PHOTOCRAFT_VERSION}"
if [[ ! -f "${source}/index.html" ]]; then
    echo "ERROR: the archive does not contain index.html; refusing to replace the bundle" >&2
    exit 1
fi

# Build the replacement beside the live bundle and swap it in only once it is
# complete, so a failed download or unpack cannot leave the app without an
# editor.
staged="${work}/staged"
mkdir -p "${staged}"
cp -a "${source}/." "${staged}/"

# Mirror snippets/ where the app's glue looks for it.
if [[ -d "${staged}/snippets" && ! -d "${staged}/app/snippets" ]]; then
    mkdir -p "${staged}/app/snippets"
    cp -a "${staged}/snippets/." "${staged}/app/snippets/"
fi

rm -rf "${dest}"
mv "${staged}" "${dest}"

echo "PhotoCraft ${PHOTOCRAFT_VERSION} vendored into ${dest}"
