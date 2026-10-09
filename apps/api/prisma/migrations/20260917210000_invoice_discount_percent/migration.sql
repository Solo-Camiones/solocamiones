-- Invoice-level commercial discount percent. Defaults to 0 (no discount).
-- Does not recalculate stored money; application to totals is a separate sales rule.

ALTER TABLE "Invoice"
ADD COLUMN "discountPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_discount_percent_check" CHECK (
    "discountPercent" >= 0
    AND "discountPercent" <= 100
);
