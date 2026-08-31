#!/usr/bin/env bash
set -euo pipefail

APP_USER="summonscrest"
APP_GROUP="summonscrest"
APP_DIR="/opt/summons-crest"
REPO_URL="https://github.com/sakagami8326/summons-crest.git"
PUBLIC_URL="${1:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

if [[ ! "${PUBLIC_URL}" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "Usage: sudo bash install.sh http://STATIC_IP" >&2
  echo "   or: sudo bash install.sh https://game.example.com" >&2
  exit 1
fi

if [[ -e "${APP_DIR}" ]]; then
  echo "${APP_DIR} already exists; refusing to overwrite it." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg debian-keyring debian-archive-keyring apt-transport-https

# Install the Node.js major version required by package.json.
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
bash /tmp/nodesource_setup.sh
apt-get install -y nodejs

# Install Caddy from its official Debian/Ubuntu repository.
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

if ! getent group "${APP_GROUP}" >/dev/null; then
  groupadd --system "${APP_GROUP}"
fi
if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --gid "${APP_GROUP}" --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

git clone --branch main --depth 1 "${REPO_URL}" "${APP_DIR}"
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"
sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" install --omit=dev --no-package-lock

install -m 0644 "${APP_DIR}/deploy/lightsail/summons-crest.service" /etc/systemd/system/summons-crest.service
cat >/etc/summons-crest.env <<EOF
NODE_ENV=production
PORT=3000
PUBLIC_URL=${PUBLIC_URL}
FEEDBACK_WEBHOOK_URL=
FEEDBACK_WEBHOOK_TOKEN=
EOF
chmod 0600 /etc/summons-crest.env

cat >/etc/caddy/Caddyfile <<EOF
${PUBLIC_URL} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now summons-crest
systemctl reload caddy

if [[ -x "${APP_DIR}/deploy/lightsail/enable-auto-deploy.sh" ]]; then
  "${APP_DIR}/deploy/lightsail/enable-auto-deploy.sh"
fi

for attempt in {1..15}; do
  if curl -fsS http://127.0.0.1:3000/api/fixture >/dev/null; then
    echo "SUMMONS CODE is running at ${PUBLIC_URL}"
    exit 0
  fi
  sleep 1
done

echo "The service did not become healthy. Check: journalctl -u summons-crest -n 100" >&2
exit 1
