#!/usr/bin/env bash
# Runs cargo from the repository root with rustup's toolchain, as `npm run format` needs it.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/toolchain.sh
exec cargo "$@"
