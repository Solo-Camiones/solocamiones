ALTER TABLE "InvoiceLine"
ADD CONSTRAINT "InvoiceLine_serviceId_required_check"
CHECK ("type" <> 'SERVICE' OR "serviceId" IS NOT NULL);
