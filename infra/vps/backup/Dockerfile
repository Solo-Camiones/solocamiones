# Backup/restore job image: PostgreSQL client tools + age + AWS CLI (R2) + GNU date.
# Used by Compose services `backup` and `verify-restore` (profile operations).
FROM postgres:16-alpine

# Refresh Alpine packages so Trivy sees current security fixes on the backup image.
# Drop gosu/su-exec from the postgres base: this image only runs client tools via
# Compose-overridden bash entrypoints, and gosu embeds a vulnerable Go stdlib that
# fails the CI Trivy HIGH/CRITICAL gate (ignore-unfixed).
RUN apk upgrade --no-cache \
    && apk add --no-cache \
      bash \
      age \
      aws-cli \
      coreutils \
      curl \
      tzdata \
    && rm -f /usr/local/bin/gosu /usr/local/bin/su-exec \
    && age --version \
    && aws --version \
    && pg_dump --version

ENV TZ=America/Santo_Domingo

WORKDIR /scripts
