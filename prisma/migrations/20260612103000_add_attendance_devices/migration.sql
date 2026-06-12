-- Generic attendance devices and credential mapping for ZKTeco ADMS support.

CREATE TABLE "AttendanceDevice" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "serialNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "commKeyHash" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "lastSeenIp" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "AttendanceDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCredential" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deviceId" TEXT,
  "provider" TEXT NOT NULL,
  "credentialType" TEXT NOT NULL,
  "credentialValue" TEXT NOT NULL,
  "personType" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "academicYear" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedBy" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttendanceCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceDevicePunchLog" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deviceId" TEXT,
  "serialNo" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "deviceUserId" TEXT NOT NULL,
  "personType" TEXT,
  "personId" TEXT,
  "credentialId" TEXT,
  "punchTime" TIMESTAMP(3) NOT NULL,
  "verifyMode" TEXT NOT NULL DEFAULT '',
  "punchStatus" TEXT NOT NULL DEFAULT '',
  "workCode" TEXT,
  "rawLine" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "errorDetail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceDevicePunchLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceDevice_serialNo_key" ON "AttendanceDevice"("serialNo");
CREATE INDEX "AttendanceDevice_schoolId_provider_isActive_idx" ON "AttendanceDevice"("schoolId", "provider", "isActive");
CREATE INDEX "AttendanceDevice_schoolId_deletedAt_idx" ON "AttendanceDevice"("schoolId", "deletedAt");

CREATE UNIQUE INDEX "AttendanceCredential_schoolId_provider_credentialType_credentialValue_key"
  ON "AttendanceCredential"("schoolId", "provider", "credentialType", "credentialValue");
CREATE INDEX "AttendanceCredential_schoolId_personType_personId_idx"
  ON "AttendanceCredential"("schoolId", "personType", "personId");
CREATE INDEX "AttendanceCredential_schoolId_provider_isActive_idx"
  ON "AttendanceCredential"("schoolId", "provider", "isActive");
CREATE INDEX "AttendanceCredential_deviceId_idx" ON "AttendanceCredential"("deviceId");

CREATE UNIQUE INDEX "AttendanceDevicePunchLog_serialNo_deviceUserId_punchTime_verifyMode_punchStatus_key"
  ON "AttendanceDevicePunchLog"("serialNo", "deviceUserId", "punchTime", "verifyMode", "punchStatus");
CREATE INDEX "AttendanceDevicePunchLog_schoolId_punchTime_idx"
  ON "AttendanceDevicePunchLog"("schoolId", "punchTime");
CREATE INDEX "AttendanceDevicePunchLog_schoolId_result_punchTime_idx"
  ON "AttendanceDevicePunchLog"("schoolId", "result", "punchTime");
CREATE INDEX "AttendanceDevicePunchLog_schoolId_personType_personId_punchTime_idx"
  ON "AttendanceDevicePunchLog"("schoolId", "personType", "personId", "punchTime");
CREATE INDEX "AttendanceDevicePunchLog_deviceId_punchTime_idx"
  ON "AttendanceDevicePunchLog"("deviceId", "punchTime");

ALTER TABLE "AttendanceDevice"
  ADD CONSTRAINT "AttendanceDevice_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCredential"
  ADD CONSTRAINT "AttendanceCredential_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCredential"
  ADD CONSTRAINT "AttendanceCredential_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceDevicePunchLog"
  ADD CONSTRAINT "AttendanceDevicePunchLog_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceDevicePunchLog"
  ADD CONSTRAINT "AttendanceDevicePunchLog_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
