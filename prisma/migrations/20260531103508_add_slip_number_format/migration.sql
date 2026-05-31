-- AlterTable
ALTER TABLE "FeeDemandConfig" ADD COLUMN     "slipNumberFormat" TEXT NOT NULL DEFAULT 'DS/{academicYear}/{subdomain}/{month}/{sequence}';
