# Quick Start - Job Queue for Demand Slips

## Summary

✅ **Implemented:** Background job queue for bulk demand slip generation using BullMQ + Redis

## What You Need to Do

### 1. Install Redis (Choose One)

**Option A: WSL2 (Recommended for Windows)**
```bash
wsl --install
# After WSL2 is installed:
wsl
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

**Option B: Docker**
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**Option C: Memurai (Windows Native)**
- Download: https://www.memurai.com/
- Install and start service

### 2. Configure Environment

Add to `.env.local`:
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. Start Everything

**Terminal 1: Next.js**
```bash
npm run dev
```

**Terminal 2: Worker**
```bash
npm run worker:demand-slips
```

### 4. Test It

**Generate bulk slips:**
```bash
POST http://localhost:3000/api/school/fees/demand-slips
Content-Type: application/json

{
  "scope": "bulk",
  "month": 6,
  "year": 2026,
  "filters": { "classId": "your-class-id" }
}
```

**Response:**
```json
{
  "useQueue": true,
  "runId": "run-id-here",
  "totalStudents": 150,
  "message": "Job queued..."
}
```

**Check progress:**
```bash
GET http://localhost:3000/api/school/fees/demand-slips/runs/{runId}
```

## How It Works

### With Redis (Queue Enabled)
1. API returns immediately with `runId`
2. Job queued in Redis
3. Worker processes in background
4. Poll `/runs/:runId` for progress
5. User can close browser - job continues ✅

### Without Redis (Fallback)
1. API processes synchronously (old behavior)
2. User waits for completion
3. Works but not ideal for large batches

## Production Deployment (VPS)

### 1. Install Redis on VPS
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 2. Install PM2
```bash
npm install -g pm2
```

### 3. Start Worker with PM2
```bash
pm2 start src/workers/start-worker.js --name demand-slip-worker
pm2 save
pm2 startup
```

### 4. Monitor
```bash
pm2 logs demand-slip-worker
pm2 status
```

## Troubleshooting

**Worker not processing jobs?**
```bash
# Check Redis
redis-cli ping
# Should return: PONG

# Check worker is running
pm2 status
# or check terminal where you ran: npm run worker:demand-slips
```

**Jobs stuck?**
```bash
# Restart worker
pm2 restart demand-slip-worker
```

## What's Next?

See `docs/DEMAND_SLIP_SUMMARY.md` for:
- Complete feature list
- Pending items (force regenerate, slip number customization, bulk print)
- Testing checklist

## Files Created

- ✅ `src/lib/queue.ts` - Queue config
- ✅ `src/workers/demand-slip-worker.ts` - Worker logic
- ✅ `src/workers/start-worker.js` - Worker startup
- ✅ `src/app/api/school/fees/demand-slips/runs/[runId]/route.ts` - Status API
- ✅ `docs/JOB_QUEUE_SETUP.md` - Detailed setup
- ✅ `docs/DEMAND_SLIP_SUMMARY.md` - Complete summary
- ✅ `package.json` - Added `worker:demand-slips` script

## Dependencies Installed

- ✅ `bullmq` - Job queue library
- ✅ `ioredis` - Redis client

Sab ready hai! Redis install karo aur test karo! 🚀
