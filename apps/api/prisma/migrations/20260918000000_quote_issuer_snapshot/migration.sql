-- QUOTE-002 / DOC-001: freeze the seller who issued the quote so COT- PDFs can
-- regenerate the Vendedor field. Mirrors confirmedBy* on completed invoices.

ALTER TABLE "Invoice"
ADD COLUMN "quoteIssuedByUserId" UUID,
ADD COLUMN "quoteIssuedByName" TEXT;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_quoteIssuedByUserId_fkey"
FOREIGN KEY ("quoteIssuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Invoice_quoteIssuedByUserId_idx" ON "Invoice"("quoteIssuedByUserId");

-- Reconstruct issuer from QUOTE_ISSUED history when the actor still exists.
UPDATE "Invoice" AS invoice
SET
  "quoteIssuedByUserId" = history."actorUserId",
  "quoteIssuedByName" = actor."name"
FROM "HistoryEvent" AS history
INNER JOIN "User" AS actor ON actor."id" = history."actorUserId"
WHERE invoice."quoteNumber" IS NOT NULL
  AND invoice."quoteIssuedByUserId" IS NULL
  AND history."subjectType" = 'INVOICE'
  AND history."subjectId" = invoice."id"
  AND history."eventType" = 'QUOTE_ISSUED'
  AND history."actorUserId" IS NOT NULL;

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
        AND (("snapshotCustomerType" = 'CASH' AND "snapshotCreditTermDays" IS NULL)
          OR ("snapshotCustomerType" = 'CREDIT' AND "snapshotCreditTermDays" IN (30, 45, 60, 90, 120)))
        AND (("quoteNumber" IS NULL AND "quoteIssuedAt" IS NULL AND "quoteExpiresAt" IS NULL
              AND "quoteIssuedByUserId" IS NULL AND "quoteIssuedByName" IS NULL)
          OR ("quoteNumber" IS NOT NULL AND "quoteIssuedAt" IS NOT NULL AND "quoteExpiresAt" IS NOT NULL))
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
        AND (("snapshotCustomerType" = 'CASH' AND "snapshotCreditTermDays" IS NULL)
          OR ("snapshotCustomerType" = 'CREDIT' AND "snapshotCreditTermDays" IN (30, 45, 60, 90, 120)))
        AND (("quoteNumber" IS NULL AND "quoteIssuedAt" IS NULL AND "quoteExpiresAt" IS NULL
              AND "quoteIssuedByUserId" IS NULL AND "quoteIssuedByName" IS NULL)
          OR ("quoteNumber" IS NOT NULL AND "quoteIssuedAt" IS NOT NULL AND "quoteExpiresAt" IS NOT NULL))
    )
);
