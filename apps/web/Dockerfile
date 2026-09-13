FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN npm install --ignore-scripts --global npm@11.19.1

COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts

COPY apps/web apps/web

ARG VITE_ENABLE_DEMO_CONTROLS
ARG VITE_CAPABILITIES_PRESET
ARG VITE_USE_MOCK_API
RUN case "$VITE_USE_MOCK_API" in true|false) ;; *) echo "VITE_USE_MOCK_API must be true or false" >&2; exit 1 ;; esac
ENV VITE_ENABLE_DEMO_CONTROLS=$VITE_ENABLE_DEMO_CONTROLS
ENV VITE_CAPABILITIES_PRESET=$VITE_CAPABILITIES_PRESET
ENV VITE_USE_MOCK_API=$VITE_USE_MOCK_API

RUN npm run build --workspace @truck-parts/web

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

USER root
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=root:root /app/apps/web/dist /usr/share/nginx/html
USER nginx

EXPOSE 8081 8080

CMD ["nginx", "-g", "daemon off;"]

