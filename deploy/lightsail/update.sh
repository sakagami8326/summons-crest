#!/usr/bin/env bash
set -euo pipefail

APP_USER="summonscrest"
APP_DIR="/opt/summons-crest"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this updater with sudo." >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "Deployment checkout not found at ${APP_DIR}." >&2
  exit 1
fi

BEFORE_SHA="$(sudo -u "${APP_USER}" git -C "${APP_DIR}" rev-parse HEAD)"
sudo -u "${APP_USER}" git -C "${APP_DIR}" fetch --prune origin main
sudo -u "${APP_USER}" git -C "${APP_DIR}" merge --ff-only origin/main
sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" install --omit=dev --no-package-lock
/usr/bin/node --check "${APP_DIR}/server.js"

systemctl restart summons-crest

for attempt in {1..15}; do
  if curl -fsS http://127.0.0.1:3000/api/fixture >/dev/null; then
    AFTER_SHA="$(sudo -u "${APP_USER}" git -C "${APP_DIR}" rev-parse HEAD)"
    echo "Deployment complete: ${BEFORE_SHA} -> ${AFTER_SHA}"
    exit 0
  fi
  sleep 1
done

echo "The updated service did not become healthy. Check: journalctl -u summons-crest -n 100" >&2
exit 1
