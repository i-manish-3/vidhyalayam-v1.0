ALTER TABLE "StudentFeePayment"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

CREATE INDEX "StudentFeePayment_cancelledAt_idx"
  ON "StudentFeePayment"("cancelledAt");
