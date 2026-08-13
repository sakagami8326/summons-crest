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

## Automatic deployment

The production instance polls public GitHub `main` every 1–2 minutes. This keeps inbound SSH restricted to the Lightsail browser client; GitHub Actions does not need direct SSH access.

Enable it once on an existing instance:

```bash
sudo bash /opt/summons-crest/deploy/lightsail/enable-auto-deploy.sh
```

After tests pass, push `main`. The timer fetches the revision, accepts only a fast-forward, installs production dependencies, checks `server.js`, restarts the service, and verifies `/api/fixture`. A failed health check restores the previous revision and will not retry the same failed revision.

Check the automation status:

```bash
systemctl status summons-crest-deploy.timer --no-pager
journalctl -u summons-crest-deploy.service -n 100 --no-pager
```

Because active rooms are held in memory, do not push `main` while a match is running.

## Manual deployment

To deploy immediately after `main` has been pushed:

```bash
sudo bash /opt/summons-crest/deploy/lightsail/update.sh
```

The same updater is safe to run manually while the timer is enabled; a lock prevents duplicate deployment.

Useful diagnostics:

```bash
systemctl status summons-crest --no-pager
journalctl -u summons-crest -n 100 --no-pager
systemctl status caddy --no-pager
```

## Runtime limitation

Active room state lives in the Node.js process. A server restart ends unsaved active rooms. Browser-created save data can still be restored through the existing save/restore flow. Keep the service to one instance and announce planned maintenance before updates.
