FROM node:22-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile

# Copy source after install so code changes don't bust the install cache
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["pnpm", "--filter", "@finwise/server", "dev"]
