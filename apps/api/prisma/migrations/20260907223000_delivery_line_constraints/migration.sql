-- Release 2 M10: at most one DELIVERY line per invoice.

CREATE UNIQUE INDEX "InvoiceLine_one_delivery_per_invoice"
ON "InvoiceLine"("invoiceId")
WHERE "type" = 'DELIVERY';
