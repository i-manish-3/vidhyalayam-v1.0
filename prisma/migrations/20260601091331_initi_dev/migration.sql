-- CreateTable
CREATE TABLE "StudentCard" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "printNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfidDevice" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastSeenIp" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RfidDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfidTapLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "studentId" TEXT,
    "deviceId" TEXT,
    "source" TEXT NOT NULL,
    "tappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "academicYear" TEXT,
    "errorDetail" TEXT,

    CONSTRAINT "RfidTapLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentCard_schoolId_uid_academicYear_isActive_idx" ON "StudentCard"("schoolId", "uid", "academicYear", "isActive");

-- CreateIndex
CREATE INDEX "StudentCard_schoolId_studentId_academicYear_idx" ON "StudentCard"("schoolId", "studentId", "academicYear");

-- CreateIndex
CREATE INDEX "StudentCard_schoolId_academicYear_isActive_idx" ON "StudentCard"("schoolId", "academicYear", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCard_schoolId_academicYear_uid_key" ON "StudentCard"("schoolId", "academicYear", "uid");

-- CreateIndex
CREATE UNIQUE INDEX "RfidDevice_apiKeyHash_key" ON "RfidDevice"("apiKeyHash");

-- CreateIndex
CREATE INDEX "RfidDevice_schoolId_isActive_idx" ON "RfidDevice"("schoolId", "isActive");

-- CreateIndex
CREATE INDEX "RfidDevice_schoolId_deletedAt_idx" ON "RfidDevice"("schoolId", "deletedAt");

-- CreateIndex
CREATE INDEX "RfidTapLog_schoolId_tappedAt_idx" ON "RfidTapLog"("schoolId", "tappedAt");

-- CreateIndex
CREATE INDEX "RfidTapLog_schoolId_studentId_tappedAt_idx" ON "RfidTapLog"("schoolId", "studentId", "tappedAt");

-- CreateIndex
CREATE INDEX "RfidTapLog_schoolId_result_tappedAt_idx" ON "RfidTapLog"("schoolId", "result", "tappedAt");

-- CreateIndex
CREATE INDEX "RfidTapLog_deviceId_tappedAt_idx" ON "RfidTapLog"("deviceId", "tappedAt");

-- AddForeignKey
ALTER TABLE "StudentCard" ADD CONSTRAINT "StudentCard_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCard" ADD CONSTRAINT "StudentCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCard" ADD CONSTRAINT "StudentCard_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCard" ADD CONSTRAINT "StudentCard_revokedBy_fkey" FOREIGN KEY ("revokedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidDevice" ADD CONSTRAINT "RfidDevice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidTapLog" ADD CONSTRAINT "RfidTapLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidTapLog" ADD CONSTRAINT "RfidTapLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RfidDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidTapLog" ADD CONSTRAINT "RfidTapLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
