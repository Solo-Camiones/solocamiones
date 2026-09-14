-- Cancelled invoices keep PDF / FX / judged-profit facts. Older applied
-- checks only allowed those packages on COMPLETED, so cancel failed with 23514.

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_pdf_document_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pdf_document_check" CHECK (
    (
        "pdfStatus" IS NULL
        AND "pdfErrorId" IS NULL
        AND "pdfGeneratedAt" IS NULL
        AND "pdfTemplateVersion" IS NULL
    )
    OR (
        "status" IN ('COMPLETED', 'CANCELLED')
        AND "pdfStatus" = 'READY'
        AND "pdfErrorId" IS NULL
        AND "pdfGeneratedAt" IS NOT NULL
        AND "pdfTemplateVersion" IS NOT NULL
    )
    OR (
        "status" IN ('COMPLETED', 'CANCELLED')
        AND "pdfStatus" = 'FAILED'
        AND "pdfErrorId" IS NOT NULL
        AND "pdfGeneratedAt" IS NOT NULL
        AND "pdfTemplateVersion" IS NOT NULL
    )
);

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_manual_gross_profit_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_manual_gross_profit_check" CHECK (
    ("manualGrossProfitDop" IS NULL AND "manualGrossProfitAt" IS NULL)
    OR (
        "status" IN ('COMPLETED', 'CANCELLED')
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
        "status" IN ('COMPLETED', 'CANCELLED')
        AND "currency" = 'USD'
        AND "exchangeRateDopPerUsd" IS NOT NULL
        AND "exchangeRateDopPerUsd" > 0
        AND "fxRateSource" IS NOT NULL
        AND "fxRateUpdatedAt" IS NOT NULL
        AND "fxRateObtainedAt" IS NOT NULL
    )
);
