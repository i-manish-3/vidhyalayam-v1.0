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

# 6. INJECT VERSION METADATA & BUILD NEXT.JS
echo "🏗️ 5. Compiling Next.js application..."
CURRENT_COMMIT=$(git rev-parse --short HEAD)
DEPLOY_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "NEXT_PUBLIC_GIT_COMMIT=$CURRENT_COMMIT" > .env.production.local
echo "NEXT_PUBLIC_DEPLOYED_AT=$DEPLOY_TIME" >> .env.production.local
echo "🔖 Building commit: $CURRENT_COMMIT deployed at $DEPLOY_TIME"

export NODE_OPTIONS="--max-old-space-size=2048"
export NEXT_TELEMETRY_DISABLED=1

npm run build

# 7. ENSURE WORLD-READABLE PERMISSIONS FOR ALL BUILD ARTIFACTS & ASSETS
echo "🔒 6. Setting permissions (chmod 755) on build artifacts..."
sudo chown -R "$USER:$USER" "$APP_DIR"
sudo chmod -R 755 "$APP_DIR"

# 8. RESTART PM2 APP & WORKERS
echo "♻️ 7. Restarting PM2 processes with updated config..."
pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save

# 9. POST-DEPLOYMENT HEALTH CHECK
echo "🩺 8. Running health check..."
sleep 4

# Check API Version
HEALTH_RESPONSE=$(curl -s http://127.0.0.1:3000/api/version || true)
if echo "$HEALTH_RESPONSE" | grep -q "online"; then
  echo "✅ Web server responded! Active deployment metadata:"
  echo "$HEALTH_RESPONSE"
else
  echo "❌ Web server health check failed on port 3000! Checking PM2 logs:"
  pm2 logs vidhyalayam --lines 30 --nostream
  exit 1
fi

# Verify static asset serving
STATIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/logo.png || true)
echo "🖼️ Static asset test (/logo.png): HTTP $STATIC_STATUS"

FIRST_CSS=$(find .next/static/chunks -name "*.css" 2>/dev/null | head -n 1 | sed 's/^\.next\///')
if [ -n "$FIRST_CSS" ]; then
  CSS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000/_next/$FIRST_CSS" || true)
  echo "🎨 CSS asset test (/_next/$FIRST_CSS): HTTP $CSS_STATUS"
  if [ "$CSS_STATUS" != "200" ]; then
    echo "⚠️ Warning: CSS asset returned HTTP $CSS_STATUS! PM2 error logs:"
    pm2 logs vidhyalayam --lines 30 --nostream
  fi
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
