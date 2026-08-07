-- Add missing School columns used by the current app
ALTER TABLE "School"
  ADD COLUMN IF NOT EXISTS "principalName" TEXT,
  ADD COLUMN IF NOT EXISTS "trustName" TEXT,
  ADD COLUMN IF NOT EXISTS "admitCardInstructions" TEXT,
  ADD COLUMN IF NOT EXISTS "admitCardTemplate" TEXT,
  ADD COLUMN IF NOT EXISTS "inventoryDuesOnFeePage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "chatbotEnabled" BOOLEAN NOT NULL DEFAULT false;
