#!/usr/bin/env bash
# Runs make-cast.mjs until the cast is made: when RUN's daily 3D cap stops it (exit 3; "Daily user credit cap reached for threeDGen"),
# waits 30 min and tries again, for up to 24 h so it gets past the next daily reset (about 13 models a day on 2026-10-23).
# The arguments go to make-cast.mjs (--cast <file>, --only, --limit, --render-only); a --cast path is from the repo root.
#   bash scripts/assets/people3d/make-cast-loop.sh [--cast <file>]
cd "$(dirname "$0")/../../.." || exit 1
export PATH="$PATH:/c/Users/$USERNAME/AppData/Local/Programs/Rundot"
# RUN's game is TrickOrTreat's: TOT_REPO, else ../TrickOrTreat, else ../../../TrickOrTreat (for a checkout in worktrees/<name>)
if [ -z "$TOT_REPO" ]; then
  for t in ../TrickOrTreat ../../../TrickOrTreat; do [ -f "$t/game.config.prod.json" ] && { TOT_REPO="$(cd "$t" && pwd)"; break; }; done
  export TOT_REPO
fi
for i in $(seq 1 48); do
  node scripts/assets/people3d/make-cast.mjs "$@"; code=$?
  [ "$code" -ne 3 ] && exit "$code"
  echo "$(date -u +%FT%TZ) RUN's daily 3D cap; waiting 30 min (try $i of 48)" >> output/people-cast.log
  sleep 1800
done
