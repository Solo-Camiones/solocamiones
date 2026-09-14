-- Release 2 M15: persist USD→DOP rate provenance for COST-003.
-- Pending FX is derived (completed USD without a stored rate). Do not invent a rate.

ALTER TABLE "Invoice"
ADD COLUMN "exchangeRateDopPerUsd" DECIMAL(18, 8),
ADD COLUMN "fxRateSource" TEXT,
ADD COLUMN "fxRateUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN "fxRateObtainedAt" TIMESTAMPTZ(3);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_fx_rate_check" CHECK (
    (
        "exchangeRateDopPerUsd" IS NULL
        AND "fxRateSource" IS NULL
        AND "fxRateUpdatedAt" IS NULL
        AND "fxRateObtainedAt" IS NULL
    )
    OR (
        "status" = 'COMPLETED'
        AND "currency" = 'USD'
        AND "exchangeRateDopPerUsd" IS NOT NULL
        AND "exchangeRateDopPerUsd" > 0
        AND "fxRateSource" IS NOT NULL
        AND "fxRateUpdatedAt" IS NOT NULL
        AND "fxRateObtainedAt" IS NOT NULL
    )
);
