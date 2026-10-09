FROM node:22-bookworm-slim AS build

WORKDIR /app

# Pull Debian security updates for base packages (e.g. perl, pcre2) before install.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --ignore-scripts --global npm@11.19.1

COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts

COPY apps/api apps/api
# PDF branding resolves this path at runtime from dist/ (see brand-tokens.ts).
COPY apps/web/src/shared/assets/brand/SoloCamionesLogo.png \
    apps/web/src/shared/assets/brand/SoloCamionesLogo.png
RUN npm run build --workspace @solocamiones/api

# Assemble a minimal install tree: manifests, dist, prisma, logo — no src/tests.
RUN mkdir -p /out/apps/api /out/apps/web/src/shared/assets/brand \
    && cp package.json package-lock.json .npmrc /out/ \
    && cp apps/api/package.json /out/apps/api/package.json \
    && cp apps/web/package.json /out/apps/web/package.json \
    && cp -R apps/api/dist /out/apps/api/dist \
    && cp -R apps/api/prisma /out/apps/api/prisma \
    && cp apps/web/src/shared/assets/brand/SoloCamionesLogo.png \
        /out/apps/web/src/shared/assets/brand/SoloCamionesLogo.png \
    && cd /out \
    && npm ci --ignore-scripts --omit=dev --workspace=@solocamiones/api --include-workspace-root \
    && npm exec -w @solocamiones/api -- prisma generate

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Runtime stage: same security upgrades as build (final image is what Trivy scans).
# Drop npm/yarn/corepack — production only runs `node`, and the bundled npm tree
# otherwise surfaces HIGH/CRITICAL findings that are irrelevant at runtime.
# Compose one-shots (migrate, assistant-purge) must use `node --run`, never `npm`.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
             /usr/local/bin/yarn /usr/local/bin/yarnpkg \
             /usr/local/bin/corepack

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=node:node /out /app

USER node

EXPOSE 3000

# Migrations run as a one-shot Compose service — never on normal API start.
CMD ["node", "apps/api/dist/index.js"]
