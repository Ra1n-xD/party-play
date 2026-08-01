#!/bin/bash
set -Eeuo pipefail

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

echo "Deploy complete."
systemctl status partyplay --no-pager
