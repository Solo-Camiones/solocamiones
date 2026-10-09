-- Release 2 M12: confirmation snapshot (customer name/RNC, confirmedAt, frozen money).

ALTER TABLE "Invoice"
ADD COLUMN "confirmedAt" TIMESTAMPTZ(3),
ADD COLUMN "customerName" TEXT,
ADD COLUMN "customerRnc" TEXT,
ADD COLUMN "gross" DECIMAL(12, 2),
ADD COLUMN "base" DECIMAL(12, 2),
ADD COLUMN "itbis" DECIMAL(12, 2);

ALTER TABLE "InvoiceLine"
ADD COLUMN "gross" DECIMAL(12, 2),
ADD COLUMN "base" DECIMAL(12, 2),
ADD COLUMN "itbis" DECIMAL(12, 2);

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_number_status_check";

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_number_status_check" CHECK (
    (
        "status" = 'DRAFT'
        AND "number" IS NULL
        AND "confirmedAt" IS NULL
        AND "customerName" IS NULL
        AND "customerRnc" IS NULL
        AND "gross" IS NULL
        AND "base" IS NULL
        AND "itbis" IS NULL
    )
    OR (
        "status" IN ('COMPLETED', 'CANCELLED')
        AND "number" IS NOT NULL
        AND "confirmedAt" IS NOT NULL
        AND "customerName" IS NOT NULL
        AND "gross" IS NOT NULL
        AND "base" IS NOT NULL
        AND "itbis" IS NOT NULL
    )
);

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_money_check" CHECK (
    ("gross" IS NULL AND "base" IS NULL AND "itbis" IS NULL)
    OR (
        "gross" IS NOT NULL
        AND "base" IS NOT NULL
        AND "itbis" IS NOT NULL
        AND "gross" >= 0
        AND "base" >= 0
        AND "itbis" >= 0
    )
);
