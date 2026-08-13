#!/usr/bin/env bash
set -euo pipefail

APP_USER="summonscrest"
APP_DIR="/opt/summons-crest"
FAILED_SHA_FILE="/var/lib/summons-crest/failed-sha"
LOCK_FILE="/run/lock/summons-crest-deploy.lock"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this updater with sudo." >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "Deployment checkout not found at ${APP_DIR}." >&2
  exit 1
fi

# Prevent a manual deployment and the timer from running together.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another Summons Crest deployment is already running."
  exit 0
fi

BEFORE_SHA="$(sudo -u "${APP_USER}" git -C "${APP_DIR}" rev-parse HEAD)"
sudo -u "${APP_USER}" git -C "${APP_DIR}" fetch --prune origin main
REMOTE_SHA="$(sudo -u "${APP_USER}" git -C "${APP_DIR}" rev-parse origin/main)"

if [[ "${BEFORE_SHA}" == "${REMOTE_SHA}" ]]; then
  echo "Already up to date: ${BEFORE_SHA}"
  exit 0
fi

if [[ -f "${FAILED_SHA_FILE}" && "$(cat "${FAILED_SHA_FILE}")" == "${REMOTE_SHA}" ]]; then
  echo "Skipping previously failed revision: ${REMOTE_SHA}" >&2
  exit 0
fi

if ! sudo -u "${APP_USER}" git -C "${APP_DIR}" diff --quiet \
  || ! sudo -u "${APP_USER}" git -C "${APP_DIR}" diff --cached --quiet; then
  echo "Deployment checkout has local changes; refusing to overwrite them." >&2
  exit 1
fi

sudo -u "${APP_USER}" git -C "${APP_DIR}" merge --ff-only origin/main

rollback() {
  echo "Deployment failed; restoring ${BEFORE_SHA}." >&2
  printf '%s\n' "${REMOTE_SHA}" >"${FAILED_SHA_FILE}"
  sudo -u "${APP_USER}" git -C "${APP_DIR}" reset --hard "${BEFORE_SHA}"
  sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" install --omit=dev --no-package-lock
  systemctl restart summons-crest
}

if ! sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" install --omit=dev --no-package-lock \
  || ! /usr/bin/node --check "${APP_DIR}/server.js"; then
  rollback
  exit 1
fi

systemctl restart summons-crest

for attempt in {1..15}; do
  if curl -fsS http://127.0.0.1:3000/api/fixture >/dev/null; then
    AFTER_SHA="$(sudo -u "${APP_USER}" git -C "${APP_DIR}" rev-parse HEAD)"
    rm -f "${FAILED_SHA_FILE}"
    echo "Deployment complete: ${BEFORE_SHA} -> ${AFTER_SHA}"
    exit 0
  fi
  sleep 1
done

rollback
echo "The updated service did not become healthy and was rolled back. Check: journalctl -u summons-crest -n 100" >&2
exit 1
