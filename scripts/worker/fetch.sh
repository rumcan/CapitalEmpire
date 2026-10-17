#!/usr/bin/env bash
# Copy files the worker produced (benchmark JSON, screenshots) back into ./output/worker/.
#   scripts/worker/fetch.sh output/bench
set -euo pipefail
HOST="${WORKER_HOST:-cworker}"
DIR="${WORKER_DIR:-/e/CapitalEmpire}"
SRC="${1:-output/bench}"
cd "$(git rev-parse --show-toplevel)"
mkdir -p output/worker
scp -q -r "$HOST:$DIR/$SRC" output/worker/
echo "copied $SRC to output/worker/$(basename "$SRC")"
