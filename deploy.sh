#!/bin/bash
set -Eeuo pipefail

deploy_lock="${PARTYPLAY_DEPLOY_LOCK:-/tmp/partyplay-deploy.lock}"
exec 9>"$deploy_lock"
if ! flock -w 600 9; then
  echo "ERROR: another PartyPlay deployment is still running" >&2
  exit 1
fi

cd ~/party-play

echo "Pulling latest changes..."
git pull --ff-only origin main

echo "Installing dependencies..."
npm ci --include=dev

echo "Building project..."
npm run build

# Verify build output
if [ ! -f server/dist/server/src/index.js ]; then
  echo "ERROR: server build failed — server/dist/server/src/index.js not found" >&2
  exit 1
fi

if [ ! -f client/dist/index.html ]; then
  echo "ERROR: client build failed — client/dist/index.html not found" >&2
  exit 1
fi

echo "Build successful! Restarting service..."
sudo systemctl restart partyplay
systemctl is-active --quiet partyplay

health_url="${PARTYPLAY_HEALTH_URL:-http://127.0.0.1:3001/readyz}"
health_attempt=1
until curl --fail --silent --show-error --connect-timeout 2 --max-time 3 "$health_url" >/dev/null; do
  if [ "$health_attempt" -ge 15 ]; then
    echo "ERROR: PartyPlay readiness check failed: $health_url" >&2
    exit 1
  fi
  sleep 1
  health_attempt=$((health_attempt + 1))
done

echo "Deploy complete."
systemctl status partyplay --no-pager
