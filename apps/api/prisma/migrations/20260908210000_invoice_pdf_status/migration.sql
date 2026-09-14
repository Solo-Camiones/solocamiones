-- Release 2 M17: operational PDF generation status (SALE-004).
-- Bytes are not stored; the completed snapshot remains the source of truth.

CREATE TYPE "InvoicePdfStatus" AS ENUM ('READY', 'FAILED');

ALTER TABLE "Invoice"
ADD COLUMN "pdfStatus" "InvoicePdfStatus",
ADD COLUMN "pdfErrorId" UUID,
ADD COLUMN "pdfGeneratedAt" TIMESTAMPTZ(3),
ADD COLUMN "pdfTemplateVersion" TEXT;

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
