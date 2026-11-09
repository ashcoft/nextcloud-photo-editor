#!/usr/bin/env bash
#
# Move the pinned PhotoCraft release in scripts/fetch-photocraft.sh forward and
# re-vendor the bundle.
#
# PhotoCraft is a vendored build, not a package dependency, so the pin is a shell
# variable that no dependency updater can see. This script is the updater: it
# resolves the wanted release, rewrites the version and its published SHA-256
# together, then runs the fetcher so the committed bundle matches the pin in the
# same change.
#
# Usage:
#   scripts/bump-photocraft.sh            # latest upstream release
#   scripts/bump-photocraft.sh 0.22.0     # a specific version
#
# Changing nothing is success: a scheduled run with no upstream release exits 0
# without touching the tree, so it cannot open an empty pull request.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fetcher="${repo_root}/scripts/fetch-photocraft.sh"
upstream="storytold/photocraft"

api_headers=(-H 'Accept: application/vnd.github+json')
# An anonymous request is capped at 60 per hour; the scheduled workflow passes
# the job token through GITHUB_TOKEN.
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    api_headers+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

if [[ $# -ge 1 && -n "${1:-}" ]]; then
    wanted="${1#v}"
else
    tag="$(curl -fsSL --proto '=https' --tlsv1.2 "${api_headers[@]}" \
        "https://api.github.com/repos/${upstream}/releases/latest" \
        | grep -o '"tag_name": *"[^"]*"' | head -1 \
        | sed 's/.*"v\{0,1\}\([^"]*\)"/\1/')"
    if [[ -z "${tag}" ]]; then
        echo "ERROR: could not resolve the latest ${upstream} release" >&2
        exit 1
    fi
    wanted="${tag}"
fi

current="$(sed -n 's/^PHOTOCRAFT_VERSION="\([^"]*\)"/\1/p' "${fetcher}" | head -1)"
if [[ -z "${current}" ]]; then
    echo "ERROR: could not read PHOTOCRAFT_VERSION from ${fetcher}" >&2
    exit 1
fi

if [[ "${wanted}" == "${current}" ]]; then
    echo "PhotoCraft ${current} is already pinned; nothing to do."
    exit 0
fi

echo "Updating PhotoCraft ${current} -> ${wanted}"

# The release publishes SHA256SUMS.txt beside the archives. Read the web build's
# digest from it rather than hashing a fresh download, so the pin records
# upstream's own published value.
sums_url="https://github.com/${upstream}/releases/download/v${wanted}/SHA256SUMS.txt"
checksum="$(curl -fsSL --proto '=https' --tlsv1.2 "${sums_url}" \
    | grep -E "[[:space:]]photocraft-web-${wanted}\.zip\$" | head -1 | awk '{print $1}')"
if [[ -z "${checksum}" ]]; then
    echo "ERROR: no SHA-256 for photocraft-web-${wanted}.zip in ${sums_url}" >&2
    exit 1
fi

# Rewrite both values in one pass so a failure cannot leave them inconsistent.
# `sed -i` is not portable between GNU and BSD, so edit through a temp file, and
# carry the original mode across the rename so the script stays executable.
mode="$(stat -c '%a' "${fetcher}" 2>/dev/null || stat -f '%Lp' "${fetcher}")"
tmp="$(mktemp)"
sed \
    -e "s|^PHOTOCRAFT_VERSION=\".*\"|PHOTOCRAFT_VERSION=\"${wanted}\"|" \
    -e "s|^PHOTOCRAFT_SHA256=\".*\"|PHOTOCRAFT_SHA256=\"${checksum}\"|" \
    "${fetcher}" > "${tmp}"
chmod "${mode}" "${tmp}"
mv "${tmp}" "${fetcher}"

bash "${fetcher}"
echo "PhotoCraft ${wanted} pinned and vendored."
