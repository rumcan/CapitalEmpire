#!/usr/bin/env bash
# Cinderlinks: the build is build.mjs (Node only); this is kept for the old habit. Pass --out <dir> to build somewhere else.
set -e
cd "$(dirname "$0")"
node build.mjs "$@"
