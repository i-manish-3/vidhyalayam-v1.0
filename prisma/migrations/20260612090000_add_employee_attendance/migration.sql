-- CreateTable
CREATE TABLE "EmployeeAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffType" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL DEFAULT '2025-2026',
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "markedBy" TEXT,
    "markedSource" TEXT NOT NULL DEFAULT 'manual',
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAttendance_schoolId_staffType_staffId_date_key" ON "EmployeeAttendance"("schoolId", "staffType", "staffId", "date");

-- CreateIndex
CREATE INDEX "EmployeeAttendance_schoolId_idx" ON "EmployeeAttendance"("schoolId");

-- CreateIndex
CREATE INDEX "EmployeeAttendance_staffType_staffId_idx" ON "EmployeeAttendance"("staffType", "staffId");

-- CreateIndex
CREATE INDEX "EmployeeAttendance_academicYear_idx" ON "EmployeeAttendance"("academicYear");

-- CreateIndex
CREATE INDEX "EmployeeAttendance_date_idx" ON "EmployeeAttendance"("date");

-- CreateIndex
CREATE INDEX "EmployeeAttendance_schoolId_date_idx" ON "EmployeeAttendance"("schoolId", "date");

-- AddForeignKey
ALTER TABLE "EmployeeAttendance" ADD CONSTRAINT "EmployeeAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendance" ADD CONSTRAINT "EmployeeAttendance_markedBy_fkey" FOREIGN KEY ("markedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendance" ADD CONSTRAINT "EmployeeAttendance_finalizedBy_fkey" FOREIGN KEY ("finalizedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
