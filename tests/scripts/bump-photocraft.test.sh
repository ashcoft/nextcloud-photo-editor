#!/usr/bin/env bash
#
# Tests for scripts/bump-photocraft.sh.
#
# `curl` and the fetcher are stubbed so the suite needs no network and does not
# download the ~14 MB archive; everything the script itself does - validation,
# release resolution, checksum selection, the pin rewrite and the restore on
# failure - runs for real.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bump="${repo_root}/scripts/bump-photocraft.sh"

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

failures=0
pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }

# A fake `curl` that answers the two URLs the script calls. FAKE_TAG feeds the
# releases endpoint, FAKE_SUM the SHA256SUMS file.
mkdir -p "${work}/bin"
cat > "${work}/bin/curl" <<'STUB'
#!/usr/bin/env bash
url=""
for arg in "$@"; do
    case "${arg}" in
        http*) url="${arg}" ;;
    esac
done
case "${url}" in
    */releases/latest)
        printf '{"tag_name": "v%s"}\n' "${FAKE_TAG}"
        ;;
    */SHA256SUMS.txt)
        printf '%s  photocraft-web-%s.zip\n' "${FAKE_SUM}" "${FAKE_TAG}"
        ;;
    *)
        exit 1
        ;;
esac
STUB
chmod +x "${work}/bin/curl"
export PATH="${work}/bin:${PATH}"

# A fetcher stub whose current pin is the given version (default 0.22.0).
seed_fetcher() {
    local version="${1:-0.22.0}"
    cat > "${work}/fetcher.sh" <<EOF
#!/usr/bin/env bash
PHOTOCRAFT_VERSION="${version}"
PHOTOCRAFT_SHA256="$(printf 'a%.0s' {1..64})"
exit 0
EOF
    chmod +x "${work}/fetcher.sh"
}

# A README stub carrying the two version references the script rewrites, so the
# real README is never touched by the suite.
seed_readme() {
    local version="${1:-0.22.0}"
    cat > "${work}/README.md" <<EOF
[![Powered by PhotoCraft](https://img.shields.io/badge/Powered%20by-PhotoCraft%20${version}-2f7bf5)](https://github.com/storytold/photocraft)

- \`photocraft/\` holds the vendored web build, currently PhotoCraft ${version}.
EOF
}

# A fetcher stub that keeps a valid pin but fails, standing in for a downloader
# that cannot reach the release. It records that it ran, so a test can tell a
# fetch failure from the script exiting earlier.
mk_failing_fetcher() {
    local version="${1:-0.22.0}"
    cat > "${work}/fetcher.sh" <<EOF
#!/usr/bin/env bash
PHOTOCRAFT_VERSION="${version}"
PHOTOCRAFT_SHA256="$(printf 'a%.0s' {1..64})"
echo "stub fetcher ran" > "${work}/fetcher.ran"
exit 1
EOF
    chmod +x "${work}/fetcher.sh"
    rm -f "${work}/fetcher.ran"
}

run_bump() {
    PHOTOCRAFT_FETCHER="${work}/fetcher.sh" PHOTOCRAFT_README="${work}/README.md" \
        PHOTOCRAFT_UPSTREAM="storytold/photocraft" \
        bash "${bump}" "$@" >"${work}/out" 2>&1
    echo $?
}

read_pin() { sed -n 's/^PHOTOCRAFT_VERSION="\([^"]*\)"/\1/p' "${work}/fetcher.sh" | head -1; }

# 1. A version that is not strict semver is rejected before anything is written.
for bad in "1.2" "abc" "1.2.3; rm -rf /" '$(id)' '1.2.3 "x"; whoami'; do
    seed_fetcher
    code="$(run_bump "${bad}")"
    if [[ "${code}" != "0" && "$(read_pin)" == "0.22.0" ]]; then
        pass "rejects invalid version '${bad}' and leaves the pin untouched"
    else
        fail "invalid version '${bad}' was not rejected (exit ${code}, pin $(read_pin))"
    fi
done

# 2. Already pinned is a no-op and exits 0.
seed_fetcher
code="$(run_bump 0.22.0)"
if [[ "${code}" == "0" ]] && grep -q "already pinned" "${work}/out"; then
    pass "no-op when the wanted version is already pinned"
else
    fail "expected a no-op for the current version (exit ${code})"
fi

# 3. A valid new version rewrites both the pin and the checksum.
seed_fetcher
seed_readme
newsum="$(printf 'b%.0s' {1..64})"
code="$(FAKE_TAG=0.30.0 FAKE_SUM="${newsum}" run_bump 0.30.0)"
sum="$(sed -n 's/^PHOTOCRAFT_SHA256="\([^"]*\)"/\1/p' "${work}/fetcher.sh" | head -1)"
if [[ "${code}" == "0" && "$(read_pin)" == "0.30.0" && "${sum}" == "${newsum}" ]]; then
    pass "rewrites version and checksum on a valid update"
else
    fail "expected pin 0.30.0 with the new checksum (exit ${code}, pin $(read_pin))"
fi

# 3b. The README's two version references move with the pin.
if grep -q 'PhotoCraft%200.30.0-2f7bf5' "${work}/README.md" &&
    grep -q 'currently PhotoCraft 0.30.0\.' "${work}/README.md"; then
    pass "rewrites both README version references on a valid update"
else
    fail "README version references were not rewritten"
fi

# 3c. A failed fetch must not leave the README pointing at the new version, and
# the fetch must actually have run (not an earlier exit that also skips it).
mk_failing_fetcher
seed_readme
badsum="$(printf 'd%.0s' {1..64})"
code="$(FAKE_TAG=0.33.0 FAKE_SUM="${badsum}" run_bump 0.33.0)"
if [[ "${code}" != "0" && -f "${work}/fetcher.ran" ]] &&
    grep -q 'PhotoCraft%200.22.0-2f7bf5' "${work}/README.md" &&
    grep -q 'currently PhotoCraft 0.22.0\.' "${work}/README.md"; then
    pass "leaves the README untouched when the fetch fails"
else
    fail "README state wrong after a failed fetch (exit ${code}, ran=$([[ -f "${work}/fetcher.ran" ]] && echo yes || echo no))"
fi

# 3d. A prerelease suffix does not survive a later bump to a plain version.
seed_fetcher 0.24.0-rc.1
seed_readme 0.24.0-rc.1
sum34="$(printf 'e%.0s' {1..64})"
code="$(FAKE_TAG=0.24.0 FAKE_SUM="${sum34}" run_bump 0.24.0)"
if [[ "${code}" == "0" ]] &&
    grep -q 'PhotoCraft%200.24.0-2f7bf5' "${work}/README.md" &&
    grep -q 'currently PhotoCraft 0.24.0\.' "${work}/README.md" &&
    ! grep -q 'rc\.1' "${work}/README.md"; then
    pass "drops a prerelease suffix when bumping to a plain version"
else
    fail "prerelease suffix survived the bump (exit ${code})"
fi

# 3e. A README the script cannot rewrite fails before the pin moves, so a retry
# is not skipped by the already-pinned branch.
seed_fetcher
cat > "${work}/README.md" <<'EOF'
A README with neither version reference.
EOF
code="$(FAKE_TAG=0.34.0 FAKE_SUM="$(printf 'f%.0s' {1..64})" run_bump 0.34.0)"
if [[ "${code}" != "0" && "$(read_pin)" == "0.22.0" ]]; then
    pass "an unrewritable README fails before the pin moves"
else
    fail "an unrewritable README did not fail early (exit ${code}, pin $(read_pin))"
fi

# 3f. A missing README fails rather than reporting success with stale metadata.
seed_fetcher
rm -f "${work}/README.md"
code="$(FAKE_TAG=0.35.0 FAKE_SUM="$(printf 'a%.0s' {1..64})" run_bump 0.35.0)"
if [[ "${code}" != "0" && "$(read_pin)" == "0.22.0" ]]; then
    pass "a missing README fails before the pin moves"
else
    fail "a missing README did not fail (exit ${code}, pin $(read_pin))"
fi

# 4. A malformed checksum is rejected and the pin is left alone.
seed_fetcher
seed_readme
code="$(FAKE_TAG=0.31.0 FAKE_SUM="not-a-sha" run_bump 0.31.0)"
if [[ "${code}" != "0" && "$(read_pin)" == "0.22.0" ]]; then
    pass "rejects a malformed checksum and leaves the pin untouched"
else
    fail "malformed checksum was accepted (exit ${code}, pin $(read_pin))"
fi

# 5. A failed fetch restores the previous pin so a retry is not skipped.
mk_failing_fetcher
seed_readme
goodsum="$(printf 'c%.0s' {1..64})"
code="$(FAKE_TAG=0.32.0 FAKE_SUM="${goodsum}" run_bump 0.32.0)"
if [[ "${code}" != "0" && "$(read_pin)" == "0.22.0" ]]; then
    pass "restores the previous pin when the fetch fails"
else
    fail "pin not restored after a failed fetch (exit ${code}, pin $(read_pin))"
fi

echo
if [[ "${failures}" -eq 0 ]]; then
    echo "All bump-photocraft tests passed."
else
    echo "${failures} test(s) failed."
fi
exit "${failures}"
