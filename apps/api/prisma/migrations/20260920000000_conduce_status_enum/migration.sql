-- CONDUCE occupies the same InvoiceStatus enum as drafts, quotes, and invoices.
-- PostgreSQL requires the value to be committed before CHECKs can reference it.

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CONDUCE';
