-- QUOTE-001: issued quotes freeze the customer's visible commercial identity.
-- This replaces, rather than edits, the already-applied Paso 2 constraint.
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
        AND (("quoteNumber" IS NULL AND "quoteIssuedAt" IS NULL AND "quoteExpiresAt" IS NULL)
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
        AND (("quoteNumber" IS NULL AND "quoteIssuedAt" IS NULL AND "quoteExpiresAt" IS NULL)
          OR ("quoteNumber" IS NOT NULL AND "quoteIssuedAt" IS NOT NULL AND "quoteExpiresAt" IS NOT NULL))
    )
);
