-- Make Student.admissionNumber unique per school instead of globally unique.
-- Each school's numbering runs on its own per-school counter, so e.g. DIPS and
-- DPS may both have ADM-2026-1001.
DROP INDEX IF EXISTS "Student_admissionNumber_key";
CREATE UNIQUE INDEX "Student_schoolId_admissionNumber_key" ON "Student"("schoolId", "admissionNumber");