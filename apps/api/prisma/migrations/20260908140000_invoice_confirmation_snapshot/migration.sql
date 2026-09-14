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

-- Preserve invoices finalized before M12 by materializing the same immutable
-- per-line money that the confirmation service now writes.
WITH "LegacyLineMoney" AS (
    SELECT
        line."id",
        ROUND(line."unitPrice" * line."quantity", 2) AS "gross",
        invoice."fiscal",
        line."type"
    FROM "InvoiceLine" AS line
    INNER JOIN "Invoice" AS invoice ON invoice."id" = line."invoiceId"
    WHERE invoice."status" IN ('COMPLETED', 'CANCELLED')
)
UPDATE "InvoiceLine" AS line
SET
    "gross" = money."gross",
    "base" = CASE
        WHEN money."fiscal" AND money."type" IN ('GENERIC', 'EXTERNAL', 'ITEM', 'QTY')
            THEN ROUND(money."gross" / 1.18, 2)
        ELSE money."gross"
    END,
    "itbis" = CASE
        WHEN money."fiscal" AND money."type" IN ('GENERIC', 'EXTERNAL', 'ITEM', 'QTY')
            THEN ROUND(money."gross" - ROUND(money."gross" / 1.18, 2), 2)
        ELSE 0.00
    END
FROM "LegacyLineMoney" AS money
WHERE line."id" = money."id";

-- M12 did not exist when these invoices were finalized, so updatedAt is the
-- closest persisted timestamp for the legacy confirmation snapshot.
WITH "LegacyInvoiceTotals" AS (
    SELECT
        invoice."id",
        customer."name" AS "customerName",
        customer."rnc" AS "customerRnc",
        COALESCE(SUM(line."gross"), 0.00) AS "gross",
        COALESCE(SUM(line."base"), 0.00) AS "base",
        COALESCE(SUM(line."itbis"), 0.00) AS "itbis"
    FROM "Invoice" AS invoice
    INNER JOIN "Customer" AS customer ON customer."id" = invoice."customerId"
    LEFT JOIN "InvoiceLine" AS line ON line."invoiceId" = invoice."id"
    WHERE invoice."status" IN ('COMPLETED', 'CANCELLED')
    GROUP BY invoice."id", customer."name", customer."rnc"
)
UPDATE "Invoice" AS invoice
SET
    "confirmedAt" = invoice."updatedAt",
    "customerName" = totals."customerName",
    "customerRnc" = totals."customerRnc",
    "gross" = totals."gross",
    "base" = totals."base",
    "itbis" = totals."itbis"
FROM "LegacyInvoiceTotals" AS totals
WHERE invoice."id" = totals."id";

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
