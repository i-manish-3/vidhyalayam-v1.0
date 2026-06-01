/*
  Warnings:

  - You are about to drop the column `changedBy` on the `FeeAuditLog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FeeAuditLog" DROP COLUMN "changedBy",
ADD COLUMN     "diffSummary" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "metadata" TEXT,
ADD COLUMN     "studentId" TEXT,
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "FeeConfigAuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "configType" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "diffSummary" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeConfigAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeConfigAuditLog_schoolId_idx" ON "FeeConfigAuditLog"("schoolId");

-- CreateIndex
CREATE INDEX "FeeConfigAuditLog_configType_configId_idx" ON "FeeConfigAuditLog"("configType", "configId");

-- CreateIndex
CREATE INDEX "FeeConfigAuditLog_schoolId_configType_createdAt_idx" ON "FeeConfigAuditLog"("schoolId", "configType", "createdAt");

-- CreateIndex
CREATE INDEX "FeeConfigAuditLog_schoolId_userId_createdAt_idx" ON "FeeConfigAuditLog"("schoolId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeConfigAuditLog_createdAt_idx" ON "FeeConfigAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "FeeAuditLog_schoolId_studentId_createdAt_idx" ON "FeeAuditLog"("schoolId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeAuditLog_schoolId_userId_createdAt_idx" ON "FeeAuditLog"("schoolId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeAuditLog_schoolId_entityType_createdAt_idx" ON "FeeAuditLog"("schoolId", "entityType", "createdAt");

-- CreateIndex
CREATE INDEX "FeeAuditLog_schoolId_action_createdAt_idx" ON "FeeAuditLog"("schoolId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "FeeAuditLog_createdAt_idx" ON "FeeAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "FeeAuditLog" ADD CONSTRAINT "FeeAuditLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAuditLog" ADD CONSTRAINT "FeeAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeConfigAuditLog" ADD CONSTRAINT "FeeConfigAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeConfigAuditLog" ADD CONSTRAINT "FeeConfigAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
