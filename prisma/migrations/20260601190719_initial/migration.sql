-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "markedSource" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "IdCardTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orientation" TEXT NOT NULL DEFAULT 'portrait',
    "widthMm" DOUBLE PRECISION NOT NULL DEFAULT 86,
    "heightMm" DOUBLE PRECISION NOT NULL DEFAULT 54,
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "frontBackground" TEXT,
    "backBackground" TEXT,
    "frontLayout" TEXT NOT NULL DEFAULT '[]',
    "backLayout" TEXT,
    "hasBackSide" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IdCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdCardGenerationLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "generatedBy" TEXT,
    "studentCount" INTEGER NOT NULL,
    "studentIds" TEXT NOT NULL,
    "academicYear" TEXT,
    "action" TEXT NOT NULL DEFAULT 'preview',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdCardGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdCardTemplate_schoolId_idx" ON "IdCardTemplate"("schoolId");

-- CreateIndex
CREATE INDEX "IdCardTemplate_schoolId_isActive_idx" ON "IdCardTemplate"("schoolId", "isActive");

-- CreateIndex
CREATE INDEX "IdCardTemplate_schoolId_isDefault_idx" ON "IdCardTemplate"("schoolId", "isDefault");

-- CreateIndex
CREATE INDEX "IdCardGenerationLog_schoolId_idx" ON "IdCardGenerationLog"("schoolId");

-- CreateIndex
CREATE INDEX "IdCardGenerationLog_templateId_idx" ON "IdCardGenerationLog"("templateId");

-- CreateIndex
CREATE INDEX "IdCardGenerationLog_createdAt_idx" ON "IdCardGenerationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_finalizedBy_fkey" FOREIGN KEY ("finalizedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCardTemplate" ADD CONSTRAINT "IdCardTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCardGenerationLog" ADD CONSTRAINT "IdCardGenerationLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCardGenerationLog" ADD CONSTRAINT "IdCardGenerationLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IdCardTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
