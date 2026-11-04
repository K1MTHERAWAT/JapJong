# ==============================================================
# Multi-stage Dockerfile for JapJong System
# Default final stage: api (NestJS Backend Service on Railway)
# ==============================================================

# ----------------- Base Image -----------------
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /app

# ----------------- Dependencies -----------------
FROM base AS dependencies
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# ----------------- Builder -----------------
FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN pnpm build:shared
RUN pnpm --filter @japjong/api prisma:generate
RUN pnpm --filter @japjong/api build

# ----------------- Web Runner (Optional Stage) -----------------
FROM base AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start", "-p", "3000"]

# ----------------- API Runner (Default Final Stage for Railway) -----------------
FROM base AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Copy workspace manifest and modules so both node and pnpm commands succeed
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Allow node dist/main.js to work seamlessly from either /app or /app/apps/api
RUN ln -s /app/apps/api/dist /app/dist

EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
