-- Persist the cancellation command identity so retries are safe even when no refund exists.

ALTER TABLE "Invoice"
ADD COLUMN "cancellationIdempotencyKey" VARCHAR(100);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancellation_idempotency_check" CHECK (
    (
        "status" = 'CANCELLED'
        AND "cancellationIdempotencyKey" IS NOT NULL
        AND length(btrim("cancellationIdempotencyKey")) > 0
    )
    OR (
        "status" <> 'CANCELLED'
        AND "cancellationIdempotencyKey" IS NULL
    )
);
