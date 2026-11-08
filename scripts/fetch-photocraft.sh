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

PHOTOCRAFT_VERSION="0.21.0"
PHOTOCRAFT_SHA256="3cf893112507ac192c921e0223a3bd5404a24b3dcf94e7a37d43f5eba2032286"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${repo_root}/photocraft"
url="https://github.com/storytold/photocraft/releases/download/v${PHOTOCRAFT_VERSION}/photocraft-web-${PHOTOCRAFT_VERSION}.zip"

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

echo "Downloading ${url}"
curl -fsSL "${url}" -o "${work}/photocraft-web.zip"

actual="$(sha256sum "${work}/photocraft-web.zip" | cut -d' ' -f1)"
if [[ "${actual}" != "${PHOTOCRAFT_SHA256}" ]]; then
    echo "ERROR: checksum mismatch for photocraft-web-${PHOTOCRAFT_VERSION}.zip" >&2
    echo "  expected ${PHOTOCRAFT_SHA256}" >&2
    echo "  actual   ${actual}" >&2
    exit 1
fi

unzip -q "${work}/photocraft-web.zip" -d "${work}/unpacked"

rm -rf "${dest}"
mkdir -p "${dest}"
cp -a "${work}/unpacked/photocraft-web-${PHOTOCRAFT_VERSION}/." "${dest}/"

# Mirror snippets/ where the app's glue looks for it.
if [[ -d "${dest}/snippets" && ! -d "${dest}/app/snippets" ]]; then
    mkdir -p "${dest}/app/snippets"
    cp -a "${dest}/snippets/." "${dest}/app/snippets/"
fi

echo "PhotoCraft ${PHOTOCRAFT_VERSION} vendored into ${dest}"
