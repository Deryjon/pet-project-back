-- Part of a return/exchange that was credited to the original sale's debt,
-- so cancelling the return can give it back. Existing rows keep 0.
ALTER TABLE "Sale" ADD COLUMN "debtCredit" DECIMAL(12,2) NOT NULL DEFAULT 0;
