#!/usr/bin/env bash
#
# Pin scripts/fetch-photocraft.sh to a PhotoCraft release and re-vendor it.
#
# Usage:
#   scripts/bump-photocraft.sh            # latest upstream release
#   scripts/bump-photocraft.sh 0.22.0     # a specific version
#
# Exits 0 without touching the tree when the wanted release is already pinned,
# so a scheduled run is a no-op rather than an empty change.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fetcher="${PHOTOCRAFT_FETCHER:-${repo_root}/scripts/fetch-photocraft.sh}"
readme="${PHOTOCRAFT_README:-${repo_root}/README.md}"
upstream="${PHOTOCRAFT_UPSTREAM:-storytold/photocraft}"

# The version is interpolated into two URLs and a sed program, and the checksum
# into shell source that is then executed, so both are held to a strict shape.
version_re='^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
sha256_re='^[0-9a-f]{64}$'

api_headers=(-H 'Accept: application/vnd.github+json')
# An anonymous request is capped at 60 per hour; the scheduled workflow passes
# the job token through GITHUB_TOKEN.
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    api_headers+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

latest_release() {
    local body
    body="$(curl -fsSL --proto '=https' --tlsv1.2 "${api_headers[@]}" \
        "https://api.github.com/repos/${upstream}/releases/latest")" || return 1
    printf '%s\n' "${body}" \
        | grep -o '"tag_name": *"[^"]*"' | head -1 \
        | sed 's/.*"v\{0,1\}\([^"]*\)"/\1/'
}

release_checksum() {
    local version="$1" sum
    sum="$(curl -fsSL --proto '=https' --tlsv1.2 \
        "https://github.com/${upstream}/releases/download/v${version}/SHA256SUMS.txt" \
        | grep -E "[[:space:]]photocraft-web-${version}\.zip\$" | head -1 | awk '{print $1}')" || true
    printf '%s' "${sum}"
}

rewrite_pin() {
    local version="$1" checksum="$2" mode tmp
    # `sed -i` is not portable between GNU and BSD, so edit through a temp file,
    # carrying the original mode across the rename to keep the script executable.
    mode="$(file_mode "${fetcher}")"
    tmp="$(mktemp)"
    sed \
        -e "s|^PHOTOCRAFT_VERSION=\".*\"|PHOTOCRAFT_VERSION=\"${version}\"|" \
        -e "s|^PHOTOCRAFT_SHA256=\".*\"|PHOTOCRAFT_SHA256=\"${checksum}\"|" \
        "${fetcher}" > "${tmp}"
    chmod "${mode}" "${tmp}"
    mv "${tmp}" "${fetcher}"
}

# The fetcher is executable; a `mktemp` backup is 0600, so restoring through one
# would strip the bit and break a direct `./scripts/fetch-photocraft.sh`.
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

# The README states the vendored version in two places - the "Powered by
# PhotoCraft" badge and the embedded-editor note. Both are rewritten into a
# staging file whose path is printed on stdout, so the caller can reject a
# README it cannot update before the pin moves, and apply it only once the
# fetch has succeeded.
#
# The exact outgoing version is replaced, rather than a numeric prefix, so a
# prerelease or build suffix cannot survive a later bump.
stage_readme() {
    local old="$1" new="$2" tmp esc_old
    # `old` is validated semver, so only `.` is a BRE metacharacter.
    esc_old="${old//./\\.}"
    tmp="$(mktemp)"
    sed \
        -e "s|\(Powered%20by-PhotoCraft%20\)${esc_old}-|\1${new}-|" \
        -e "s|\(currently PhotoCraft \)${esc_old}\.|\1${new}.|" \
        "${readme}" > "${tmp}"
    if ! grep -qF "PhotoCraft%20${new}-" "${tmp}" ||
        ! grep -qF "currently PhotoCraft ${new}." "${tmp}"; then
        rm -f "${tmp}"
        echo "ERROR: could not record PhotoCraft ${new} in ${readme}" >&2
        return 1
    fi
    printf '%s' "${tmp}"
}

main() {
    local wanted current checksum backup staged_readme backup_mode

    if [[ $# -ge 1 && -n "${1:-}" ]]; then
        wanted="${1#v}"
    else
        wanted="$(latest_release)" || {
            echo "ERROR: could not resolve the latest ${upstream} release" >&2
            return 1
        }
    fi

    if [[ ! "${wanted}" =~ ${version_re} ]]; then
        echo "ERROR: '${wanted}' is not a valid version" >&2
        return 1
    fi

    current="$(sed -n 's/^PHOTOCRAFT_VERSION="\([^"]*\)"/\1/p' "${fetcher}" | head -1)"
    if [[ -z "${current}" ]]; then
        echo "ERROR: could not read PHOTOCRAFT_VERSION from ${fetcher}" >&2
        return 1
    fi

    if [[ "${wanted}" == "${current}" ]]; then
        echo "PhotoCraft ${current} is already pinned; nothing to do."
        return 0
    fi

    echo "Updating PhotoCraft ${current} -> ${wanted}"

    # The release publishes SHA256SUMS.txt beside the archives; take the web
    # build's digest from it rather than hashing a fresh download.
    checksum="$(release_checksum "${wanted}")"
    if [[ ! "${checksum}" =~ ${sha256_re} ]]; then
        echo "ERROR: no valid SHA-256 for photocraft-web-${wanted}.zip" >&2
        return 1
    fi

    # The README must be present and rewritable before the pin moves: if it
    # cannot be updated, failing here leaves the tree untouched, rather than
    # pinning a version the README never records and a retry then skips.
    if [[ ! -f "${readme}" ]]; then
        echo "ERROR: ${readme} does not exist" >&2
        return 1
    fi
    if ! staged_readme="$(stage_readme "${current}" "${wanted}")"; then
        return 1
    fi

    backup="$(mktemp)"
    cp "${fetcher}" "${backup}"
    backup_mode="$(file_mode "${fetcher}")"
    rewrite_pin "${wanted}" "${checksum}"

    # The pin and the bundle move together: if the fetch fails, restore the old
    # pin so a retry does not read the new version as current while the old
    # bundle is still on disk. The staged README is discarded with it, and the
    # fetcher keeps its executable bit.
    if ! bash "${fetcher}"; then
        cp "${backup}" "${fetcher}"
        chmod "${backup_mode}" "${fetcher}"
        rm -f "${backup}" "${staged_readme}"
        echo "ERROR: fetching PhotoCraft ${wanted} failed; restored the previous pin" >&2
        return 1
    fi
    rm -f "${backup}"

    mv "${staged_readme}" "${readme}"

    echo "PhotoCraft ${wanted} pinned and vendored."
}

main "$@"
