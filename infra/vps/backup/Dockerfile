# Backup/restore job image: PostgreSQL client tools + age + AWS CLI (R2) + GNU date.
# Used by Compose services `backup` and `verify-restore` (profile operations).
FROM postgres:16-alpine

# Refresh Alpine packages so Trivy sees current security fixes on the backup image.
RUN apk upgrade --no-cache \
    && apk add --no-cache \
      bash \
      age \
      aws-cli \
      coreutils \
      curl \
      tzdata \
    && age --version \
    && aws --version \
    && pg_dump --version

ENV TZ=America/Santo_Domingo

WORKDIR /scripts
