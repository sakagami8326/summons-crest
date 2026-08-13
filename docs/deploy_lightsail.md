# Summons Crest: AWS Lightsail deployment

Summons Crest uses an in-memory room server, Server-Sent Events, and runtime BOT timers. Run exactly one persistent Node.js process; do not place multiple app instances behind a load balancer.

## Recommended instance

- Region: Asia Pacific (Tokyo)
- Platform: Linux/Unix
- Blueprint: OS only / Ubuntu 24.04 LTS
- Bundle: Micro, 1 GB RAM, public IPv4
- Instance name: `summons-crest-prod`

Current production endpoint: `https://52-68-169-20.sslip.io`

Attach a static IP before publishing the URL. Open TCP 80 and 443 to the internet. Restrict TCP 22 (SSH) to the administrator's current public IP whenever possible. Do not expose port 3000 in the Lightsail firewall; Caddy is the only public entry point.

## Initial installation

Connect with the browser-based Lightsail SSH console, then run:

```bash
git clone --depth 1 https://github.com/sakagami8326/summons-crest.git setup-summons-crest
sudo bash setup-summons-crest/deploy/lightsail/install.sh http://STATIC_IP
```

Replace `STATIC_IP` with the attached Lightsail static IPv4 address. This initial URL uses HTTP. The installer adds Node.js 22, Caddy, a locked-down `summonscrest` service account, and a restarting systemd service.

Verify both endpoints from a separate device:

```text
http://STATIC_IP/
http://STATIC_IP/api/fixture
```

## Add a domain and HTTPS

Point the domain's A record at the static IP. Then update the two server files:

```bash
sudo sed -i 's#PUBLIC_URL=.*#PUBLIC_URL=https://game.example.com#' /etc/summons-crest.env
sudo sed -i '1s#.*#game.example.com {#' /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl restart summons-crest
```

Caddy obtains and renews the TLS certificate after DNS resolves and ports 80/443 are reachable.

## Deploy an update

After `main` has been pushed and tests have passed:

```bash
sudo bash /opt/summons-crest/deploy/lightsail/update.sh
```

The updater accepts only a fast-forward from `origin/main`, installs production dependencies without generating a lockfile, checks `server.js`, restarts the service, and verifies `/api/fixture` locally.

Useful diagnostics:

```bash
systemctl status summons-crest --no-pager
journalctl -u summons-crest -n 100 --no-pager
systemctl status caddy --no-pager
```

## Runtime limitation

Active room state lives in the Node.js process. A server restart ends unsaved active rooms. Browser-created save data can still be restored through the existing save/restore flow. Keep the service to one instance and announce planned maintenance before updates.
