# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @vrchat-quicklookup/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @vrchat-quicklookup/shared build \
 && pnpm --filter @vrchat-quicklookup/api build \
 && pnpm --filter @vrchat-quicklookup/api deploy --prod /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out ./
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
