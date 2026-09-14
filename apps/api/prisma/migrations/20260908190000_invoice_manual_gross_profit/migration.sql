-- Release 2 M14: Administrator-recorded DOP gross profit (COST-005).
-- Amount is judged profit, not invented acquisition cost. Both columns are set together.

ALTER TABLE "Invoice"
ADD COLUMN "manualGrossProfitDop" DECIMAL(12, 2),
ADD COLUMN "manualGrossProfitAt" TIMESTAMPTZ(3);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_manual_gross_profit_check" CHECK (
    ("manualGrossProfitDop" IS NULL AND "manualGrossProfitAt" IS NULL)
    OR (
        "status" = 'COMPLETED'
        AND "manualGrossProfitDop" IS NOT NULL
        AND "manualGrossProfitAt" IS NOT NULL
    )
);
