#!/usr/bin/env bash
#
# Deploy the Manikstu CRM frontend (Next.js) on the production server.
# SSH into the host, cd into this app's directory, then run:  ./deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Manikstu CRM frontend deploy"
echo "--> Pulling latest from origin/main"
git pull origin main

echo "--> Installing dependencies (clean, from lockfile)"
npm ci

echo "--> Building"
npm run build

echo "--> Restarting the app"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart manikstu_crm 2>/dev/null || pm2 start npm --name manikstu_crm -- start
elif [ -d tmp ] || mkdir -p tmp; then
  # Phusion Passenger (e.g. Hostinger): touch the restart trigger
  touch tmp/restart.txt
fi

echo "==> CRM frontend deployed. New code is live on next request."
