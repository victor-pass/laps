port := "5173"

default:
    @just --list

# Dev server over HTTPS at this machine's tailnet name, so phones on the
# tailnet get the secure context the camera needs. Stops serving on exit.
dev-tailscale:
    #!/usr/bin/env bash
    set -euo pipefail
    tailscale serve --bg {{port}}
    trap 'tailscale serve --https=443 off' EXIT
    echo "Serving on https://$(tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")')"
    pnpm dev --port {{port}} --strictPort

# Build and deploy to Cloudflare.
deploy:
    pnpm run deploy
