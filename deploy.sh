#!/bin/bash
set -e

cd ~/party-play

echo "Pulling latest changes..."
git pull origin master

echo "Installing dependencies..."
npm install --omit=dev

echo "Building project..."
npm run build

# Verify build output
if [ ! -f server/dist/index.js ]; then
  echo "ERROR: server build failed — server/dist/index.js not found" >&2
  exit 1
fi

if [ ! -f client/dist/index.html ]; then
  echo "ERROR: client build failed — client/dist/index.html not found" >&2
  exit 1
fi

echo "Build successful! Restarting service..."
sudo systemctl restart partyplay

echo "Deploy complete."
systemctl status partyplay --no-pager
