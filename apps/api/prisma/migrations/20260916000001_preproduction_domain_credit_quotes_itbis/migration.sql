-- Pre-production Paso 2: customer credit classification, quote columns on the
-- sales aggregate, applyItbis flag, and confirmation snapshots.
--
-- Depends on InvoiceStatus values QUOTE_DRAFT and QUOTE_ISSUED already committed.
-- Does not recalculate stored money. COMPLETED/CANCELLED gross, base, and itbis
-- stay exactly as persisted.
--
-- Operational rollback: restore a database backup taken before this change set.
-- Prisma does not ship a down migration. Reverse DDL, if needed on an empty
-- failed deploy: drop the new checks/indexes/columns/sequence row. Leave the
-- added InvoiceStatus enum values in place (PostgreSQL cannot easily drop them).

CREATE TYPE "CustomerType" AS ENUM ('CASH', 'CREDIT');

ALTER TABLE "Customer"
ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'CASH',
ADD COLUMN "creditLimitDop" DECIMAL(12, 2),
ADD COLUMN "creditTermDays" INTEGER;

-- Existing named customers and Cliente contado become CASH. Names are untouched.
UPDATE "Customer"
SET
    "customerType" = 'CASH',
    "creditLimitDop" = NULL,
    "creditTermDays" = NULL;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_credit_terms_check" CHECK (
    (
        "customerType" = 'CASH'
        AND "creditLimitDop" IS NULL
        AND "creditTermDays" IS NULL
    )
    OR (
        "customerType" = 'CREDIT'
        AND "isDefault" = false
        AND "rnc" IS NOT NULL
        AND "creditLimitDop" IS NOT NULL
        AND "creditLimitDop" > 0
        AND "creditTermDays" IN (30, 45, 60, 90, 120)
    )
);

CREATE INDEX "Customer_customerType_idx" ON "Customer"("customerType");

ALTER TABLE "Invoice"
ADD COLUMN "applyItbis" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "quoteNumber" TEXT,
ADD COLUMN "quoteIssuedAt" TIMESTAMPTZ(3),
ADD COLUMN "quoteExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN "snapshotCustomerType" "CustomerType",
ADD COLUMN "snapshotCreditTermDays" INTEGER;

-- Historical documents: ITBIS was not a separate flag. Owner chose false for
-- current test data. Credit snapshots match the CASH customer backfill.
UPDATE "Invoice"
SET "applyItbis" = false;

UPDATE "Invoice"
SET
    "snapshotCustomerType" = 'CASH',
    "snapshotCreditTermDays" = NULL
WHERE "status" IN ('COMPLETED', 'CANCELLED');

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_number_status_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_number_status_check" CHECK (
    (
        "status" IN ('DRAFT', 'QUOTE_DRAFT')
        AND "number" IS NULL
        AND "quoteNumber" IS NULL
        AND "quoteIssuedAt" IS NULL
        AND "quoteExpiresAt" IS NULL
        AND "confirmedAt" IS NULL
        AND "dueDate" IS NULL
        AND "customerName" IS NULL
        AND "customerRnc" IS NULL
        AND "customerPhone" IS NULL
        AND "snapshotCustomerType" IS NULL
        AND "snapshotCreditTermDays" IS NULL
        AND "confirmedByUserId" IS NULL
        AND "confirmedByName" IS NULL
        AND "cancelledAt" IS NULL
        AND "cancelReason" IS NULL
        AND "cancelledByUserId" IS NULL
        AND "cancelledByName" IS NULL
        AND "gross" IS NULL
        AND "base" IS NULL
        AND "itbis" IS NULL
    )
    OR (
        "status" = 'QUOTE_ISSUED'
        AND "number" IS NULL
        AND "quoteNumber" IS NOT NULL
        AND "quoteIssuedAt" IS NOT NULL
        AND "quoteExpiresAt" IS NOT NULL
        AND "quoteExpiresAt" >= "quoteIssuedAt"
        AND "confirmedAt" IS NULL
        AND "dueDate" IS NULL
        AND "customerName" IS NULL
        AND "customerRnc" IS NULL
        AND "customerPhone" IS NULL
        AND "snapshotCustomerType" IS NULL
        AND "snapshotCreditTermDays" IS NULL
        AND "confirmedByUserId" IS NULL
        AND "confirmedByName" IS NULL
        AND "cancelledAt" IS NULL
        AND "cancelReason" IS NULL
        AND "cancelledByUserId" IS NULL
        AND "cancelledByName" IS NULL
        AND "gross" IS NOT NULL
        AND "base" IS NOT NULL
        AND "itbis" IS NOT NULL
    )
    OR (
        "status" = 'COMPLETED'
        AND "number" IS NOT NULL
        AND "confirmedAt" IS NOT NULL
        AND "dueDate" IS NOT NULL
        AND "customerName" IS NOT NULL
        AND "cancelledAt" IS NULL
        AND "cancelReason" IS NULL
        AND "cancelledByUserId" IS NULL
        AND "cancelledByName" IS NULL
        AND "gross" IS NOT NULL
        AND "base" IS NOT NULL
        AND "itbis" IS NOT NULL
        AND "snapshotCustomerType" IS NOT NULL
        AND (
            (
                "snapshotCustomerType" = 'CASH'
                AND "snapshotCreditTermDays" IS NULL
            )
            OR (
                "snapshotCustomerType" = 'CREDIT'
                AND "snapshotCreditTermDays" IN (30, 45, 60, 90, 120)
            )
        )
        AND (
            (
                "quoteNumber" IS NULL
                AND "quoteIssuedAt" IS NULL
                AND "quoteExpiresAt" IS NULL
            )
            OR (
                "quoteNumber" IS NOT NULL
                AND "quoteIssuedAt" IS NOT NULL
                AND "quoteExpiresAt" IS NOT NULL
            )
        )
    )
    OR (
        "status" = 'CANCELLED'
        AND "number" IS NOT NULL
        AND "confirmedAt" IS NOT NULL
        AND "dueDate" IS NOT NULL
        AND "customerName" IS NOT NULL
        AND "cancelledAt" IS NOT NULL
        AND length(btrim("cancelReason")) > 0
        AND "cancelledByUserId" IS NOT NULL
        AND length(btrim("cancelledByName")) > 0
        AND "gross" IS NOT NULL
        AND "base" IS NOT NULL
        AND "itbis" IS NOT NULL
        AND "snapshotCustomerType" IS NOT NULL
        AND (
            (
                "snapshotCustomerType" = 'CASH'
                AND "snapshotCreditTermDays" IS NULL
            )
            OR (
                "snapshotCustomerType" = 'CREDIT'
                AND "snapshotCreditTermDays" IN (30, 45, 60, 90, 120)
            )
        )
        AND (
            (
                "quoteNumber" IS NULL
                AND "quoteIssuedAt" IS NULL
                AND "quoteExpiresAt" IS NULL
            )
            OR (
                "quoteNumber" IS NOT NULL
                AND "quoteIssuedAt" IS NOT NULL
                AND "quoteExpiresAt" IS NOT NULL
            )
        )
    )
);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quote_number_format_check" CHECK (
    "quoteNumber" IS NULL OR "quoteNumber" ~ '^COT-[0-9]{6}$'
);

CREATE UNIQUE INDEX "Invoice_quoteNumber_key" ON "Invoice"("quoteNumber");
CREATE INDEX "Invoice_customerId_status_currency_idx"
ON "Invoice"("customerId", "status", "currency");
CREATE INDEX "Invoice_quoteExpiresAt_idx" ON "Invoice"("quoteExpiresAt");
CREATE INDEX "Invoice_completed_customer_currency_idx"
ON "Invoice"("customerId", "currency")
WHERE "status" = 'COMPLETED';

INSERT INTO "InvoiceSequence" ("name", "nextValue")
VALUES ('COT', 1);
