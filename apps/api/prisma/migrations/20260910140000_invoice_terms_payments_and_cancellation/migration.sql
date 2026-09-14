-- Invoice document snapshots, fixed 30-day due date, additive payments, and cancellation facts.

CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CHECK');

ALTER TABLE "Invoice"
ADD COLUMN "dueDate" DATE,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "confirmedByUserId" UUID,
ADD COLUMN "confirmedByName" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMPTZ(3),
ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "cancelledByUserId" UUID,
ADD COLUMN "cancelledByName" TEXT;

-- Historical seller/phone snapshots cannot be reconstructed reliably. Due dates can.
UPDATE "Invoice"
SET "dueDate" = (("confirmedAt" AT TIME ZONE 'America/Santo_Domingo')::date + 30)
WHERE "confirmedAt" IS NOT NULL;

CREATE TABLE "InvoicePayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceId" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "currency" "InvoiceCurrency" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reference" TEXT,
    "actorUserId" UUID NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoicePayment_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "InvoicePayment_reference_check" CHECK (
        "reference" IS NULL OR length(btrim("reference")) > 0
    ),
    CONSTRAINT "InvoicePayment_idempotency_key_check" CHECK (
        "idempotencyKey" IS NULL OR length(btrim("idempotencyKey")) > 0
    )
);

CREATE UNIQUE INDEX "InvoicePayment_invoiceId_idempotencyKey_key"
ON "InvoicePayment"("invoiceId", "idempotencyKey");
CREATE INDEX "InvoicePayment_invoiceId_effectiveDate_createdAt_idx"
ON "InvoicePayment"("invoiceId", "effectiveDate", "createdAt");
CREATE INDEX "InvoicePayment_actorUserId_idx" ON "InvoicePayment"("actorUserId");
CREATE INDEX "Invoice_confirmedByUserId_idx" ON "Invoice"("confirmedByUserId");
CREATE INDEX "Invoice_cancelledByUserId_idx" ON "Invoice"("cancelledByUserId");
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_confirmedByUserId_fkey"
FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledByUserId_fkey"
FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_number_status_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_number_status_check" CHECK (
    (
        "status" = 'DRAFT'
        AND "number" IS NULL
        AND "confirmedAt" IS NULL
        AND "dueDate" IS NULL
        AND "customerName" IS NULL
        AND "customerRnc" IS NULL
        AND "customerPhone" IS NULL
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
    )
);
