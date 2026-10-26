# Lists the recipes (what plain `just` runs).
default:
    @just --list

# Dev server over HTTPS at this machine's tailnet name, so phones on the
# tailnet get the secure context the camera needs. Uses Vite's usual port,
# or the next free one, and a tailnet HTTPS port no other serve is using.
# Stops only its own serve on exit.
dev-tailscale:
    #!/usr/bin/env bash
    set -euo pipefail
    port=5173
    while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null; do port=$((port + 1)); done
    used=$(tailscale serve status --json | jq -r '.TCP // {} | keys[]')
    https=""
    for p in 443 8443 10000; do
        grep -qx "$p" <<<"$used" || { https=$p; break; }
    done
    [ -n "$https" ] || { echo "tailscale serve is already using 443, 8443 and 10000" >&2; exit 1; }
    tailscale serve --bg --https="$https" "$port"
    trap 'tailscale serve --https="$https" off' EXIT
    host=$(tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")')
    echo "Serving on https://$host$([ "$https" = 443 ] || echo ":$https")"
    pnpm dev --port "$port" --strictPort

# Build and deploy to Cloudflare.
deploy:
    pnpm run deploy
