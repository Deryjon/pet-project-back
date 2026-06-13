-- Add extraPayments JSON column to Sale for split/mixed payment support
ALTER TABLE "Sale" ADD COLUMN "extraPayments" JSONB;
