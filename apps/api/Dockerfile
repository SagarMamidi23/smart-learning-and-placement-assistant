# Build context: repo root (docker build -f apps/api/Dockerfile .)
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm ci -w @slp/shared -w @slp/api --include-workspace-root
RUN npm run build -w @slp/shared && npm run build -w @slp/api

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci -w @slp/shared -w @slp/api --omit=dev
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
# Small, committed domain configs for `node apps/api/dist/scripts/seedDomains.js` (not the raw datasets).
COPY data/seeds data/seeds
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "apps/api/dist/index.js"]