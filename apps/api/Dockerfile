FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --ignore-scripts --global npm@11.19.1

COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts

COPY apps/api apps/api
COPY apps/web/src/shared/assets/brand/SoloCamionesLogo.png apps/web/src/shared/assets/brand/SoloCamionesLogo.png
RUN npm run build --workspace @truck-parts/api

USER node

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=node:node /app /app

USER node

EXPOSE 3000

CMD ["sh", "-c", "./apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/index.js"]
