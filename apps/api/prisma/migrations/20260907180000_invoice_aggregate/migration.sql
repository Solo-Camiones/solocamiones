-- Release 2 M6: invoice aggregate, line types, and shared FAC- sequence row.

CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InvoiceCurrency" AS ENUM ('DOP', 'USD');
CREATE TYPE "InvoiceLineType" AS ENUM ('GENERIC', 'SERVICE', 'DELIVERY', 'EXTERNAL', 'ITEM', 'QTY');
CREATE TYPE "CostProvenance" AS ENUM ('ACTUAL', 'ESTIMATED', 'UNKNOWN');

CREATE TABLE "Invoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "InvoiceStatus" NOT NULL,
    "currency" "InvoiceCurrency" NOT NULL,
    "fiscal" BOOLEAN NOT NULL,
    "customerId" UUID NOT NULL,
    "number" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invoice_number_status_check" CHECK (
        ("status" = 'DRAFT' AND "number" IS NULL)
        OR ("status" IN ('COMPLETED', 'CANCELLED') AND "number" IS NOT NULL)
    )
);

CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceId" UUID NOT NULL,
    "type" "InvoiceLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12, 2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12, 2) NOT NULL,
    "acquisitionCostDop" DECIMAL(12, 2),
    "costProvenance" "CostProvenance",
    "serviceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceLine_description_check" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "InvoiceLine_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "InvoiceLine_unitPrice_check" CHECK ("unitPrice" >= 0),
    CONSTRAINT "InvoiceLine_cost_check" CHECK (
        ("costProvenance" IS NULL AND "acquisitionCostDop" IS NULL)
        OR ("costProvenance" = 'UNKNOWN' AND "acquisitionCostDop" IS NULL)
        OR (
            "costProvenance" IN ('ACTUAL', 'ESTIMATED')
            AND "acquisitionCostDop" IS NOT NULL
        )
    ),
    CONSTRAINT "InvoiceLine_serviceId_type_check" CHECK (
        "type" = 'SERVICE' OR "serviceId" IS NULL
    )
);

CREATE TABLE "InvoiceSequence" (
    "name" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("name")
);

CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX "InvoiceLine_serviceId_idx" ON "InvoiceLine"("serviceId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "MechanicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "InvoiceSequence" ("name", "nextValue")
VALUES ('FAC', 1);
