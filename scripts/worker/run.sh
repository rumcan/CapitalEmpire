#!/usr/bin/env bash
# Run a command on the LAN worker PC against a snapshot of this working tree (uncommitted changes included).
#   scripts/worker/run.sh "npm test"
#   scripts/worker/run.sh "npm run build && node scripts/perf/bench.mjs --serve --channel chrome --size 1"
# How: the working tree is written to a throwaway commit (a temporary index, so your own index and branches are not
# touched), pushed over SSH to the worker's clone as refs/heads/worker-snapshot, checked out there (detached), and the
# command runs in it. npm install only runs when package-lock.json changed. Nothing is committed or pushed FROM the
# worker: it is a read-only runner.
# Needs the `cworker` host alias in ~/.ssh/config (see docs/PROGRESS.md, "Remote worker").
set -euo pipefail
HOST="${WORKER_HOST:-cworker}"
DIR="${WORKER_DIR:-/e/CapitalEmpire}"
CMD="${1:?usage: scripts/worker/run.sh \"<command>\"}"
cd "$(git rev-parse --show-toplevel)"

# first time: an empty repo on the worker that accepts pushes
ssh "$HOST" "test -d '$DIR/.git' || (mkdir -p '$DIR' && cd '$DIR' && git init -q && git config core.autocrlf false && git config receive.denyCurrentBranch ignore && echo 'worker clone created at $DIR')"

idx="$(mktemp)"; trap 'rm -f "$idx"' EXIT
cp .git/index "$idx"
GIT_INDEX_FILE="$idx" git add -A
tree="$(GIT_INDEX_FILE="$idx" git write-tree)"
snap="$(git commit-tree "$tree" -p HEAD -m "worker snapshot of $(git rev-parse --short HEAD)")"
git push -q --force "ssh://$HOST$DIR" "$snap:refs/heads/worker-snapshot"

ssh "$HOST" "cd '$DIR' && git checkout -q -f --detach worker-snapshot && git clean -qfd -e node_modules -e output \
  && h=\$(git hash-object package-lock.json) && if [ \"\$(cat node_modules/.lockhash 2>/dev/null)\" != \"\$h\" ]; then npm install --no-audit --no-fund --loglevel=error && echo \$h > node_modules/.lockhash; fi \
  && echo \"[worker] \$(hostname) snapshot $(git rev-parse --short "$snap") of $(git rev-parse --short HEAD)\" && $CMD"
