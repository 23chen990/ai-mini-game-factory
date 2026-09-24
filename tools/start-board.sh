#!/usr/bin/env bash
set -euo pipefail

# Start the optional factory board from any checkout location.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export FACTORY_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
export BOARD_PORT="${BOARD_PORT:-4173}"

exec node "$FACTORY_ROOT/tools/board.mjs" "$@"
