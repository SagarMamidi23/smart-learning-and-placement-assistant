# Build context: repo root (docker build -f apps/web/Dockerfile .)
FROM node:20-alpine AS build
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
# Set both for a same-site deployment (Render): NEXT_PUBLIC_API_URL=same-origin and API_PROXY_TARGET=<public API origin>.
ARG API_PROXY_TARGET=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL API_PROXY_TARGET=$API_PROXY_TARGET NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm ci -w @slp/shared -w @slp/web --include-workspace-root
RUN npm run build -w @slp/shared && npm run build -w @slp/web

FROM node:20-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /repo
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]