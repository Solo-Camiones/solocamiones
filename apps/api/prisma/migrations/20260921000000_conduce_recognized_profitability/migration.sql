-- CON-006: USD FX and judged gross profit are recognized at conduce emission.
-- Prior checks allowed those facts only on COMPLETED/CANCELLED, so recording
-- them on CONDUCE failed with 23514.

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_manual_gross_profit_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_manual_gross_profit_check" CHECK (
    ("manualGrossProfitDop" IS NULL AND "manualGrossProfitAt" IS NULL)
    OR (
        "status" IN ('COMPLETED', 'CANCELLED', 'CONDUCE')
        AND "manualGrossProfitDop" IS NOT NULL
        AND "manualGrossProfitAt" IS NOT NULL
    )
);

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_fx_rate_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_fx_rate_check" CHECK (
    (
        "exchangeRateDopPerUsd" IS NULL
        AND "fxRateSource" IS NULL
        AND "fxRateUpdatedAt" IS NULL
        AND "fxRateObtainedAt" IS NULL
    )
    OR (
        "status" IN ('COMPLETED', 'CANCELLED', 'CONDUCE')
        AND "currency" = 'USD'
        AND "exchangeRateDopPerUsd" IS NOT NULL
        AND "exchangeRateDopPerUsd" > 0
        AND "fxRateSource" IS NOT NULL
        AND "fxRateUpdatedAt" IS NOT NULL
        AND "fxRateObtainedAt" IS NOT NULL
    )
);
