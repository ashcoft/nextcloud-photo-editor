#!/usr/bin/env bash
#
# Guards the install step of the pnpm audit workflow.
#
# `pnpm audit --fix` writes new overrides into pnpm-workspace.yaml but leaves
# the lockfile alone, and pnpm defaults to --frozen-lockfile when CI is set. A
# bare `pnpm install` there therefore aborts with
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH and the job never opens its pull request,
# which is exactly how the scheduled run failed. Nothing else in the suite
# would notice that returning, so it is asserted here.
#
# The check is structural: the real install needs the network and a package
# manager, so the workflow text is what gets inspected.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workflow="${repo_root}/.github/workflows/pnpm-audit.yml"

failures=0
pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }

# step_run_block <name> prints the `run:` body of the named step, one command
# per line and without indentation, or nothing if the step has no such block.
step_run_block() {
    awk -v want="$1" '
        /^      - name: / {
            inside = (index($0, "name: " want) > 0)
            in_run = 0
            next
        }
        inside && !in_run && /^        run: \|/ { in_run = 1; next }
        inside && in_run && /^ +[^ ]/ { sub(/^ +/, ""); print; next }
        inside && in_run { in_run = 0 }
    ' "${workflow}"
}

# 1. The workflow still applies audit fixes, which is why the install cannot be
#    frozen: the overrides land outside the lockfile.
audit_block="$(step_run_block 'Fix pnpm audit')"
if [[ "${audit_block}" == *"pnpm audit --fix"* ]]; then
    pass "the audit step still runs pnpm audit --fix"
else
    fail "the audit step no longer runs pnpm audit --fix (block: '${audit_block}')"
fi

# 2. Every install command in the build step is unfrozen. A second, frozen
#    command would be fine, but a bare one is the regression.
install_block="$(step_run_block 'Run pnpm install and build')"
install_cmds="$(printf '%s\n' "${install_block}" | grep -E '^pnpm install([[:space:]]|$)' || true)"
if [[ -z "${install_cmds}" ]]; then
    fail "no 'pnpm install' command in the 'Run pnpm install and build' step"
else
    total="$(printf '%s\n' "${install_cmds}" | grep -c .)"
    unfrozen="$(printf '%s\n' "${install_cmds}" | grep -c -- '--no-frozen-lockfile' || true)"
    if [[ "${total}" == "${unfrozen}" ]]; then
        pass "the build step installs with --no-frozen-lockfile"
    else
        fail "an install in the build step is frozen, so the job would abort with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH (found: ${install_cmds//$'\n'/ | })"
    fi
fi

# 3. The install has to come after the audit fix, or it installs the lockfile
#    the overrides were written against.
audit_line="$(grep -n 'name: Fix pnpm audit' "${workflow}" | cut -d: -f1 | head -1)"
install_line="$(grep -n 'name: Run pnpm install and build' "${workflow}" | cut -d: -f1 | head -1)"
if [[ -n "${audit_line}" && -n "${install_line}" && "${audit_line}" -lt "${install_line}" ]]; then
    pass "the install step runs after the audit fix"
else
    fail "the install step does not follow the audit fix (audit line '${audit_line}', install line '${install_line}')"
fi

# 4. The step still builds, so an override that breaks the build is caught
#    before a pull request is opened.
if [[ "${install_block}" == *"pnpm run --if-present build"* ]]; then
    pass "the build step still builds after installing"
else
    fail "the build step no longer builds after installing"
fi

echo
if [[ "${failures}" -eq 0 ]]; then
    echo "All pnpm-audit workflow tests passed."
else
    echo "${failures} test(s) failed."
fi
exit "${failures}"
