# ==============================================================
# Multi-stage Dockerfile for JapJong Booking System
# Targets:
#   - api (NestJS Backend Service)
#   - web (Next.js Frontend Service)
# ==============================================================

# ----------------- Base Image -----------------
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
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
RUN pnpm --filter @japjong/api build
RUN pnpm --filter @japjong/web build

# ----------------- API Runner -----------------
FROM base AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]

# ----------------- Web Runner -----------------
FROM base AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
