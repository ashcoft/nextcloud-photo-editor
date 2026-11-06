#!/bin/bash
set -euo pipefail

# Enable corepack so the pinned pnpm version is used.
corepack enable

# Resolve the repository relative to this script, so setup works from any
# checkout location rather than only the path the agent happens to use.
cd "$(dirname "$(readlink -f "$0")")/.."

pnpm install
