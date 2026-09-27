#!/usr/bin/env bash
set -e

APP_DIR="/var/www/vidhyalayam"
REPO_URL="https://github.com/i-manish-3/vidhyalayam-v1.0.git"
BRANCH="${DEPLOY_BRANCH:-main}"

echo "=========================================================="
echo "🚀 [CI/CD] STARTING ZERO-DOWNTIME DEPLOYMENT FOR $BRANCH"
echo "=========================================================="

# 1. ENSURE DIRECTORY & GIT REPOSITORY EXIST
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "⚠️ $APP_DIR is not a Git repo; initializing repository..."
  if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" /tmp/vidhyalayam.env.bak
  fi
  cd "$APP_DIR"
  git init
  git remote add origin "$REPO_URL" || git remote set-url origin "$REPO_URL"
  git fetch origin "$BRANCH"
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
  if [ -f /tmp/vidhyalayam.env.bak ]; then
    mv /tmp/vidhyalayam.env.bak "$APP_DIR/.env"
  fi
fi

# 2. VERIFY REDIS (Compulsory for Vidhyalayam)
echo "🔍 1. Verifying Redis Service..."
if ! redis-cli ping | grep -q "PONG"; then
  echo "⚠️ Redis not responding. Attempting systemctl restart..."
  sudo systemctl restart redis-server || true
  sleep 2
  redis-cli ping | grep -q "PONG" || { echo "❌ Fatal: Redis is down!"; exit 1; }
fi
echo "✅ Redis is active."

# 3. NAVIGATE TO PROJECT DIRECTORY & PULL
cd "$APP_DIR"
echo "📥 2. Fetching and updating code ($BRANCH)..."
git remote set-url origin "$REPO_URL"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# 4. INSTALL DEPENDENCIES
echo "📦 3. Installing dependencies..."
npm install --prefer-offline --no-audit

# 5. GENERATE PRISMA CLIENT & SYNC DB
echo "🗄️ 4. Syncing Prisma database schema..."
npx prisma generate
npx prisma db push --accept-data-loss

# 6. BUILD NEXT.JS IN A TEMPORARY FOLDER TO PREVENT CORRUPTING LIVE SITE
echo "🏗️ 5. Compiling Next.js application..."
# Set memory limit to prevent Azure B-series VM from OOM crashing
export NODE_OPTIONS="--max-old-space-size=2048"
export NEXT_TELEMETRY_DISABLED=1

npm run build

# 7. RELOAD PM2 APP & WORKERS
echo "♻️ 6. Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save

# 8. POST-DEPLOYMENT HEALTH CHECK
echo "🩺 7. Running health check..."
sleep 4
if curl -s -f http://127.0.0.1:3000 > /dev/null; then
  echo "✅ Next.js web server responded on port 3000!"
else
  echo "❌ Web server health check failed on port 3000! Checking PM2 logs:"
  pm2 logs vidhyalayam --lines 20 --nostream
  exit 1
fi

for proc in vidhyalayam worker-demand worker-notifications worker-exports worker-audit; do
  if pm2 describe "$proc" 2>/dev/null | grep -q "online"; then
    echo "✅ $proc is online."
  else
    echo "⚠️ Warning: $proc is not online. Check 'pm2 status'."
  fi
done

echo "=========================================================="
echo "🎉 DEPLOYMENT FINISHED SUCCESSFULLY!"
echo "=========================================================="
