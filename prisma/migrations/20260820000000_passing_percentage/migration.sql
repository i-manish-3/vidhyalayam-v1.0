-- DropIndex
DROP INDEX IF EXISTS "Student_admissionNumber_idx";

-- AlterTable
ALTER TABLE "ExamComponent" DROP COLUMN "passingMarks";

-- AlterTable
ALTER TABLE "ExamSubjectConfig" DROP COLUMN "graceMarksMax",
DROP COLUMN "passingMarks",
ADD COLUMN     "passingPercentage" DOUBLE PRECISION NOT NULL DEFAULT 33;

-- AlterTable
ALTER TABLE "MarksEntry" DROP COLUMN "graceMarks";