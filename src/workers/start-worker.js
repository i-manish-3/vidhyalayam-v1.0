#!/usr/bin/env node

/**
 * Demand Slip Worker Process
 *
 * This is a standalone Node.js process that runs the BullMQ worker
 * to process demand slip generation jobs in the background.
 *
 * Usage:
 *   npm run worker:demand-slips
 *
 * For production, use PM2 or similar process manager:
 *   pm2 start "npm run worker:demand-slips" --name demand-slip-worker
 */

// Load environment variables
require('dotenv').config()

// Import the worker (TypeScript file will be handled by tsx)
require('./demand-slip-worker.ts')

// Keep the process running
process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT received, shutting down gracefully...')
  process.exit(0)
})

console.log('[Worker] Worker process started. Press Ctrl+C to stop.')
