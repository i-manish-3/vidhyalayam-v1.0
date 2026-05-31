# Job Queue Setup Guide

## Overview

Bulk demand slip generation now uses **BullMQ** with **Redis** for background processing. This allows:
- ✅ Instant API response (no waiting)
- ✅ Background processing
- ✅ Progress tracking
- ✅ Automatic retries on failure
- ✅ Scalable (multiple workers)

## Prerequisites

### 1. Install Redis

#### Windows (Development)
Download and install Redis for Windows:
- **Option A:** Use WSL2 (recommended)
  ```bash
  wsl --install
  # Then in WSL:
  sudo apt update
  sudo apt install redis-server
  sudo service redis-server start
  ```

- **Option B:** Use Memurai (Redis-compatible)
  - Download from: https://www.memurai.com/
  - Install and start the service

- **Option C:** Use Docker
  ```bash
  docker run -d -p 6379:6379 redis:7-alpine
  ```

#### Linux (VPS Production)
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### 2. Configure Environment Variables

Add to `.env.local` (development) or `.env` (production):

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional: Enable queue even without REDIS_HOST set
USE_QUEUE=true
```

## Usage

### 1. Start the Worker Process

The worker must be running to process jobs.

#### Development
```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start worker
npm run worker:demand-slips
```

Add to `package.json` scripts:
```json
{
  "scripts": {
    "worker:demand-slips": "node src/workers/start-worker.js"
  }
}
```

#### Production (VPS with PM2)
```bash
# Install PM2 globally
npm install -g pm2

# Start worker with PM2
pm2 start src/workers/start-worker.js --name demand-slip-worker

# Start on system boot
pm2 startup
pm2 save

# Monitor worker
pm2 logs demand-slip-worker
pm2 status
```

### 2. Generate Demand Slips (API)

**Request:**
```bash
POST /api/school/fees/demand-slips
Content-Type: application/json

{
  "scope": "bulk",
  "month": 6,
  "year": 2026,
  "filters": {
    "classId": "class-id-here"
  },
  "force": false
}
```

**Response (with queue):**
```json
{
  "scope": "bulk",
  "month": 6,
  "year": 2026,
  "useQueue": true,
  "runId": "run-id-here",
  "totalStudents": 150,
  "message": "Job queued for background processing. Use /runs/:runId to check status."
}
```

**Response (without queue - fallback):**
```json
{
  "scope": "bulk",
  "month": 6,
  "year": 2026,
  "useQueue": false,
  "result": {
    "runId": "run-id-here",
    "totalStudents": 150,
    "successCount": 145,
    "skippedCount": 3,
    "failedCount": 2
  }
}
```

### 3. Check Job Status

**Request:**
```bash
GET /api/school/fees/demand-slips/runs/:runId
```

**Response:**
```json
{
  "run": {
    "id": "run-id",
    "status": "running",
    "totalStudents": 150,
    "successCount": 75,
    "skippedCount": 2,
    "failedCount": 1,
    "startedAt": "2026-05-31T10:00:00Z",
    "completedAt": null
  },
  "job": {
    "id": "run-id",
    "state": "active",
    "progress": {
      "total": 150,
      "processed": 78,
      "successCount": 75,
      "skippedCount": 2,
      "failedCount": 1,
      "currentStudentId": "student-id"
    }
  },
  "progress": 52
}
```

## Behavior

### With Queue (Redis Available)
1. API returns immediately with `runId`
2. Job is queued in Redis
3. Worker picks up job and processes in background
4. Frontend polls `/runs/:runId` for progress
5. User can close browser - job continues

### Without Queue (Redis Not Available)
1. API processes synchronously (old behavior)
2. User must wait for completion
3. Returns full result immediately

## Monitoring

### Check Redis
```bash
# Connect to Redis CLI
redis-cli

# Check queue length
LLEN bull:demand-slip-generation:wait

# Check active jobs
LLEN bull:demand-slip-generation:active

# Check completed jobs
LLEN bull:demand-slip-generation:completed
```

### Check Worker Logs
```bash
# PM2
pm2 logs demand-slip-worker

# Or direct node process
node src/workers/start-worker.js
```

## Troubleshooting

### Worker not processing jobs
1. Check Redis is running: `redis-cli ping`
2. Check worker is running: `pm2 status` or check terminal
3. Check worker logs for errors

### Jobs stuck in queue
1. Restart worker: `pm2 restart demand-slip-worker`
2. Check Redis connection in logs
3. Verify environment variables are set

### Redis connection errors
1. Verify Redis is running
2. Check REDIS_HOST and REDIS_PORT in .env
3. Check firewall rules (production)

## Performance Tuning

### Worker Concurrency
Edit `src/workers/demand-slip-worker.ts`:
```typescript
{
  connection: redisConnection,
  concurrency: 10, // Increase for more parallel processing
}
```

### Job Retries
Edit `src/lib/queue.ts`:
```typescript
defaultJobOptions: {
  attempts: 5, // Increase retry attempts
  backoff: {
    type: 'exponential',
    delay: 5000, // Increase delay between retries
  },
}
```

## Next Steps

1. ✅ Install Redis
2. ✅ Add environment variables
3. ✅ Start worker process
4. ✅ Test bulk generation
5. ✅ Monitor progress
6. 🔄 Set up PM2 for production
