-- Optional per-line notes, independent of description (max 100 characters).

ALTER TABLE "InvoiceLine" ADD COLUMN "notes" TEXT;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_notes_check" CHECK (
    "notes" IS NULL
    OR (
        length(btrim("notes")) > 0
        AND char_length("notes") <= 100
    )
);
