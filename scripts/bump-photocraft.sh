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
    mode="$(stat -c '%a' "${fetcher}" 2>/dev/null || stat -f '%Lp' "${fetcher}")"
    tmp="$(mktemp)"
    sed \
        -e "s|^PHOTOCRAFT_VERSION=\".*\"|PHOTOCRAFT_VERSION=\"${version}\"|" \
        -e "s|^PHOTOCRAFT_SHA256=\".*\"|PHOTOCRAFT_SHA256=\"${checksum}\"|" \
        "${fetcher}" > "${tmp}"
    chmod "${mode}" "${tmp}"
    mv "${tmp}" "${fetcher}"
}

# The README states the vendored version in two places - the "Powered by
# PhotoCraft" badge and the embedded-editor note - so a bump moves both or the
# two drift apart. Failing when neither matches keeps a stale README from
# passing unnoticed.
rewrite_readme() {
    local version="$1" tmp
    [[ -f "${readme}" ]] || return 0
    tmp="$(mktemp)"
    sed \
        -e "s|PhotoCraft%20[0-9][0-9.]*-|PhotoCraft%20${version}-|" \
        -e "s|currently PhotoCraft [0-9][0-9.]*\.|currently PhotoCraft ${version}.|" \
        "${readme}" > "${tmp}"
    if ! grep -q "PhotoCraft%20${version}-" "${tmp}" ||
        ! grep -q "currently PhotoCraft ${version}\." "${tmp}"; then
        rm -f "${tmp}"
        echo "ERROR: could not record PhotoCraft ${version} in ${readme}" >&2
        return 1
    fi
    mv "${tmp}" "${readme}"
}

main() {
    local wanted current checksum backup

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

    backup="$(mktemp)"
    cp "${fetcher}" "${backup}"
    rewrite_pin "${wanted}" "${checksum}"

    # The pin and the bundle move together: if the fetch fails, restore the old
    # pin so a retry does not read the new version as current while the old
    # bundle is still on disk.
    if ! bash "${fetcher}"; then
        mv "${backup}" "${fetcher}"
        echo "ERROR: fetching PhotoCraft ${wanted} failed; restored the previous pin" >&2
        return 1
    fi
    rm -f "${backup}"

    rewrite_readme "${wanted}"

    echo "PhotoCraft ${wanted} pinned and vendored."
}

main "$@"
