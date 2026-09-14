-- Release 2 M1/M3: customers, contacts, generic cash customer, mechanical service catalog.

CREATE TABLE "Customer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "rnc" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Customer_name_check" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "Customer_rnc_format_check" CHECK (
        "rnc" IS NULL
        OR (
            "rnc" ~ '^[0-9]+$'
            AND (length("rnc") = 9 OR length("rnc") = 11)
        )
    ),
    CONSTRAINT "Customer_default_no_rnc_check" CHECK (NOT "isDefault" OR "rnc" IS NULL)
);

CREATE TABLE "CustomerContact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerContact_phone_or_email_check" CHECK (
        (NULLIF(btrim(COALESCE("phone", '')), '') IS NOT NULL)
        OR (NULLIF(btrim(COALESCE("email", '')), '') IS NOT NULL)
    )
);

CREATE TABLE "MechanicalService" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MechanicalService_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MechanicalService_name_check" CHECK (length(btrim("name")) > 0)
);

CREATE UNIQUE INDEX "Customer_rnc_key" ON "Customer"("rnc");
CREATE UNIQUE INDEX "Customer_one_default_idx" ON "Customer"("isDefault") WHERE "isDefault";
CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");
CREATE UNIQUE INDEX "CustomerContact_one_primary_idx" ON "CustomerContact"("customerId") WHERE "isPrimary";
CREATE INDEX "MechanicalService_active_name_idx" ON "MechanicalService"("active", "name");

ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Customer" ("name", "isDefault", "updatedAt")
VALUES ('Cliente contado', true, CURRENT_TIMESTAMP);
