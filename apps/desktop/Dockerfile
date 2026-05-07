FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/desktop/package.json apps/desktop/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/desktop/ apps/desktop/

# Empty string → same-origin, Nginx proxies /api → server container
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter finwise-desktop build

FROM nginx:alpine
COPY apps/desktop/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/desktop/dist /usr/share/nginx/html
EXPOSE 80
