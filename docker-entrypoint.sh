#!/usr/bin/env bash
# Build the site, then (if DEPLOY_REPO + GITHUB_TOKEN are set) force-push dist/
# to that repo's gh-pages branch. Repeats every PUSH_INTERVAL_HOURS.
# shortcut: interval loop instead of an external scheduler; set PUSH_INTERVAL_HOURS=0 to run once.
set -euo pipefail

INTERVAL_HOURS="${PUSH_INTERVAL_HOURS:-24}"

build() {
  npm run generate:site
  npm run build
}

push_gh_pages() {
  if [ -z "${DEPLOY_REPO:-}" ] || [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "[entrypoint] DEPLOY_REPO/GITHUB_TOKEN not set; skipping push"
    return 0
  fi
  local dir=/tmp/gh-pages
  rm -rf "$dir"
  git init -q -b gh-pages "$dir"
  cd "$dir"
  git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${DEPLOY_REPO}.git"
  if git fetch -q --depth 1 origin gh-pages 2>/dev/null; then
    git checkout -q -B gh-pages FETCH_HEAD
  else
    git checkout -q -B gh-pages
  fi
  find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -a /app/dist/. .
  git add -A
  if git diff --cached --quiet; then
    echo "[entrypoint] gh-pages unchanged; nothing to push"
  else
    git -c user.name="dokploy-builder" -c user.email="dokploy@localhost" \
      commit -q -m "deploy $(date -u +%FT%TZ)"
    git push -q -f origin gh-pages
    echo "[entrypoint] pushed dist to ${DEPLOY_REPO}@gh-pages"
  fi
  cd /app
}

while true; do
  build
  push_gh_pages
  if [ "$INTERVAL_HOURS" -le 0 ] 2>/dev/null; then
    echo "[entrypoint] PUSH_INTERVAL_HOURS=${INTERVAL_HOURS}; exiting after one run"
    break
  fi
  echo "[entrypoint] done; sleeping ${INTERVAL_HOURS}h"
  sleep "$((INTERVAL_HOURS * 3600))"
done
