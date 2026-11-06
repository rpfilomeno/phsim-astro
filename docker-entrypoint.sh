#!/usr/bin/env bash
# Build the site, then (if DEPLOY_REPO + GITHUB_TOKEN are set) force-push dist/
# to that repo's main branch. Repeats every PUSH_INTERVAL_HOURS.
# shortcut: interval loop instead of an external scheduler; set PUSH_INTERVAL_HOURS=0 to run once.
set -euo pipefail

INTERVAL_HOURS="${PUSH_INTERVAL_HOURS:-24}"
BRANCH=main

build() {
  npm run generate:site
  npm run build
}

push_site() {
  if [ -z "${DEPLOY_REPO:-}" ] || [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "[entrypoint] DEPLOY_REPO/GITHUB_TOKEN not set; skipping push"
    return 0
  fi
  local dir=/tmp/site
  rm -rf "$dir"
  git init -q -b "$BRANCH" "$dir"
  cd "$dir"
  git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${DEPLOY_REPO}.git"
  if git fetch -q --depth 1 origin "$BRANCH" 2>/dev/null; then
    git checkout -q -B "$BRANCH" FETCH_HEAD
  else
    git checkout -q -B "$BRANCH"
  fi
  find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -a /app/dist/. .
  git add -A
  if git diff --cached --quiet; then
    echo "[entrypoint] ${BRANCH} unchanged; nothing to push"
  else
    # [skip ci] so the PAT push doesn't trigger the target repo's workflows
    git -c user.name="dokploy-builder" -c user.email="dokploy@localhost" \
      commit -q -m "deploy $(date -u +%FT%TZ) [skip ci]"
    git push -q -f origin "$BRANCH"
    echo "[entrypoint] pushed dist to ${DEPLOY_REPO}@${BRANCH}"
  fi
  cd /app
}

while true; do
  build
  push_site
  if [ "$INTERVAL_HOURS" -le 0 ] 2>/dev/null; then
    echo "[entrypoint] PUSH_INTERVAL_HOURS=${INTERVAL_HOURS}; exiting after one run"
    break
  fi
  echo "[entrypoint] done; sleeping ${INTERVAL_HOURS}h"
  sleep "$((INTERVAL_HOURS * 3600))"
done
