#!/bin/bash
cd /home/z/my-project
export DATABASE_URL=postgresql://z:postgres@127.0.0.1:5432/mydigitalacademy
while true; do
  echo "Starting Next.js server..."
  npx next dev -p 3000 2>&1
  echo "Server crashed, restarting in 3s..."
  sleep 3
done
