#!/usr/bin/env bash
# Runs make-cast.mjs until the cast is made: when RUN's rate limit stops it (exit 3), waits 30 min and tries again (at most 16 times, 8 h).
#   bash scripts/assets/people3d/make-cast-loop.sh
cd "$(dirname "$0")/../../.." || exit 1
export PATH="$PATH:/c/Users/$USERNAME/AppData/Local/Programs/Rundot"
for i in $(seq 1 16); do
  node scripts/assets/people3d/make-cast.mjs; code=$?
  [ "$code" -ne 3 ] && exit "$code"
  echo "$(date -u +%FT%TZ) rate limited; waiting 30 min (try $i)" >> output/people-cast.log
  sleep 1800
done
