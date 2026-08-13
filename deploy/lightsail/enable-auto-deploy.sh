#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/summons-crest"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this setup with sudo." >&2
  exit 1
fi

if [[ ! -x "${APP_DIR}/deploy/lightsail/update.sh" ]]; then
  echo "Lightsail updater not found at ${APP_DIR}." >&2
  exit 1
fi

install -d -m 0755 /var/lib/summons-crest
install -m 0644 "${APP_DIR}/deploy/lightsail/summons-crest-deploy.service" \
  /etc/systemd/system/summons-crest-deploy.service
install -m 0644 "${APP_DIR}/deploy/lightsail/summons-crest-deploy.timer" \
  /etc/systemd/system/summons-crest-deploy.timer

systemctl daemon-reload
systemctl enable --now summons-crest-deploy.timer
systemctl start summons-crest-deploy.service

echo "Automatic deployment is enabled."
systemctl list-timers summons-crest-deploy.timer --no-pager
