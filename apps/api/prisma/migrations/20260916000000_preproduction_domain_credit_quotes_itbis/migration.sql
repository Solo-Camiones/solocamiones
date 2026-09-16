-- Quote stages occupy the same InvoiceStatus enum as invoices.
-- PostgreSQL requires these values to be committed before CHECKs can reference them.

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'QUOTE_DRAFT';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'QUOTE_ISSUED';
