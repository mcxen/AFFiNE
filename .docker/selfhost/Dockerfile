# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /workspace

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl ca-certificates && \
  rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ .yarn/

COPY packages/backend/server/package.json packages/backend/server/
COPY packages/backend/server/schema.prisma   packages/backend/server/

COPY packages/backend/native/package.json packages/backend/native/
COPY packages/backend/native/index.js      packages/backend/native/
COPY packages/backend/native/index.d.ts    packages/backend/native/
COPY packages/backend/native/server-native.*.node packages/backend/native/
COPY packages/common/s3-compat/package.json packages/common/s3-compat/

RUN corepack enable && \
  yarn config set --json supportedArchitectures.cpu '["x64", "arm64", "arm"]' && \
  yarn config set --json supportedArchitectures.libc '["glibc"]' && \
  YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn workspaces focus @affine/server --production

RUN yarn workspace @affine/server prisma generate

COPY packages/backend/server/dist    packages/backend/server/dist
COPY packages/backend/server/scripts packages/backend/server/scripts

COPY packages/frontend/apps/web/dist     packages/frontend/apps/web/dist
COPY packages/frontend/admin/dist        packages/frontend/admin/dist
COPY packages/frontend/apps/mobile/dist  packages/frontend/apps/mobile/dist

ARG TARGETARCH
ARG TARGETVARIANT
RUN cd packages/backend/server && \
  mv /workspace/node_modules . && \
  AFFINE_DOCKER_CLEAN=1 TARGETARCH="${TARGETARCH}" TARGETVARIANT="${TARGETVARIANT}" \
  node ./scripts/docker-clean.mjs


FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=deps /workspace/packages/backend/server /app
COPY --from=deps /workspace/packages/frontend/apps/web/dist    /app/static
COPY --from=deps /workspace/packages/frontend/admin/dist       /app/static/admin
COPY --from=deps /workspace/packages/frontend/apps/mobile/dist  /app/static/mobile

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl libjemalloc2 && \
  rm -rf /var/lib/apt/lists/*

ENV LD_PRELOAD=libjemalloc.so.2

EXPOSE 3010

CMD ["node", "./dist/main.js"]
