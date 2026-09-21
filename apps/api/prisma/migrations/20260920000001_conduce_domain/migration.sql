-- Feature 16 / CON-001: conduce identity on the same sales aggregate as FAC-/COT-.
-- Preserves existing amounts, timestamps, and snapshots; only fills new columns.

ALTER TABLE "Invoice"
ADD COLUMN "conduceNumber" TEXT,
ADD COLUMN "conduceIssuedAt" TIMESTAMPTZ(3),
ADD COLUMN "invoiceIssuedAt" TIMESTAMPTZ(3);

-- Historical FAC- rows: documentary invoice date equals commercial recognition.
UPDATE "Invoice"
SET "invoiceIssuedAt" = "confirmedAt"
WHERE "number" IS NOT NULL
  AND "confirmedAt" IS NOT NULL
  AND "invoiceIssuedAt" IS NULL;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_conduce_number_format_check" CHECK (
    "conduceNumber" IS NULL OR "conduceNumber" ~ '^CON-[0-9]{6}$'
);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_conduce_pair_check" CHECK (
    ("conduceNumber" IS NULL AND "conduceIssuedAt" IS NULL)
    OR ("conduceNumber" IS NOT NULL AND "conduceIssuedAt" IS NOT NULL)
);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_invoice_issued_pair_check" CHECK (
    ("number" IS NULL AND "invoiceIssuedAt" IS NULL)
    OR ("number" IS NOT NULL AND "invoiceIssuedAt" IS NOT NULL)
);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_invoice_issued_after_confirmed_check" CHECK (
    "invoiceIssuedAt" IS NULL
    OR "confirmedAt" IS NULL
    OR "invoiceIssuedAt" >= "confirmedAt"
);

CREATE UNIQUE INDEX "Invoice_conduceNumber_key" ON "Invoice"("conduceNumber");
CREATE INDEX "Invoice_status_confirmedAt_idx" ON "Invoice"("status", "confirmedAt");

-- Prepare CxC / credit-exposure lookups for open conduces (queries still COMPLETED-only until M4).
DROP INDEX IF EXISTS "Invoice_completed_customer_currency_idx";
CREATE INDEX "Invoice_recognized_customer_currency_idx"
ON "Invoice"("customerId", "currency")
WHERE "status" IN ('COMPLETED', 'CONDUCE');

INSERT INTO "InvoiceSequence" ("name", "nextValue")
VALUES ('CON', 1);

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_number_status_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_number_status_check" CHECK (
    (
        "status" IN ('DRAFT', 'QUOTE_DRAFT')
        AND "number" IS NULL
        AND "quoteNumber" IS NULL
        AND "quoteIssuedAt" IS NULL
        AND "quoteExpiresAt" IS NULL
        AND "quoteIssuedByUserId" IS NULL
        AND "quoteIssuedByName" IS NULL
        AND "conduceNumber" IS NULL
        AND "conduceIssuedAt" IS NULL
        AND "invoiceIssuedAt" IS NULL
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
        -- Issuer is required for new issues in application code; NULL stays only for
        -- historical rows that cannot be reconstructed (DOC-001).
        AND (
          ("quoteIssuedByUserId" IS NULL AND "quoteIssuedByName" IS NULL)
          OR ("quoteIssuedByUserId" IS NOT NULL AND length(btrim("quoteIssuedByName")) > 0)
        )
        AND "conduceNumber" IS NULL
        AND "conduceIssuedAt" IS NULL
        AND "invoiceIssuedAt" IS NULL
        AND "confirmedAt" IS NULL
        AND "dueDate" IS NULL
        AND "customerName" IS NOT NULL
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
        "status" = 'CONDUCE'
        AND "number" IS NULL
        AND "invoiceIssuedAt" IS NULL
        AND "conduceNumber" IS NOT NULL
        AND "conduceIssuedAt" IS NOT NULL
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
        AND (("snapshotCustomerType" = 'CASH' AND "snapshotCreditTermDays" IS NULL)
          OR ("snapshotCustomerType" = 'CREDIT' AND "snapshotCreditTermDays" IN (30, 45, 60, 90, 120)))
        AND (("quoteNumber" IS NULL AND "quoteIssuedAt" IS NULL AND "quoteExpiresAt" IS NULL
              AND "quoteIssuedByUserId" IS NULL AND "quoteIssuedByName" IS NULL)
          OR ("quoteNumber" IS NOT NULL AND "quoteIssuedAt" IS NOT NULL AND "quoteExpiresAt" IS NOT NULL))
    )
    OR (
        "status" = 'COMPLETED'
        AND "number" IS NOT NULL
        AND "invoiceIssuedAt" IS NOT NULL
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
        AND (("snapshotCustomerType" = 'CASH' AND "snapshotCreditTermDays" IS NULL)
          OR ("snapshotCustomerType" = 'CREDIT' AND "snapshotCreditTermDays" IN (30, 45, 60, 90, 120)))
        AND (("quoteNumber" IS NULL AND "quoteIssuedAt" IS NULL AND "quoteExpiresAt" IS NULL
              AND "quoteIssuedByUserId" IS NULL AND "quoteIssuedByName" IS NULL)
          OR ("quoteNumber" IS NOT NULL AND "quoteIssuedAt" IS NOT NULL AND "quoteExpiresAt" IS NOT NULL))
        AND (("conduceNumber" IS NULL AND "conduceIssuedAt" IS NULL)
          OR ("conduceNumber" IS NOT NULL AND "conduceIssuedAt" IS NOT NULL))
    )
    OR (
        "status" = 'CANCELLED'
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
        AND (("snapshotCustomerType" = 'CASH' AND "snapshotCreditTermDays" IS NULL)
          OR ("snapshotCustomerType" = 'CREDIT' AND "snapshotCreditTermDays" IN (30, 45, 60, 90, 120)))
        AND (("quoteNumber" IS NULL AND "quoteIssuedAt" IS NULL AND "quoteExpiresAt" IS NULL
              AND "quoteIssuedByUserId" IS NULL AND "quoteIssuedByName" IS NULL)
          OR ("quoteNumber" IS NOT NULL AND "quoteIssuedAt" IS NOT NULL AND "quoteExpiresAt" IS NOT NULL))
        AND (
            (
                "number" IS NOT NULL
                AND "invoiceIssuedAt" IS NOT NULL
                AND (("conduceNumber" IS NULL AND "conduceIssuedAt" IS NULL)
                  OR ("conduceNumber" IS NOT NULL AND "conduceIssuedAt" IS NOT NULL))
            )
            OR (
                "number" IS NULL
                AND "invoiceIssuedAt" IS NULL
                AND "conduceNumber" IS NOT NULL
                AND "conduceIssuedAt" IS NOT NULL
            )
        )
    )
);
