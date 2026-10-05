-- Loyalty cashback credited to the client's balance for this document
-- (positive on a sale/exchange, negative on a return). Zero when no client
-- was selected or the loyalty program is off.
ALTER TABLE "Sale" ADD COLUMN "cashbackAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Part of the document paid from the client's loyalty balance (positive on a
-- sale), or given back to that balance (negative on a return).
ALTER TABLE "Sale" ADD COLUMN "cashbackPaid" DECIMAL(12,2) NOT NULL DEFAULT 0;
