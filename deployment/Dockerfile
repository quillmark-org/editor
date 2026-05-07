# Build stage
FROM node:24 AS builder

WORKDIR /app

COPY package*.json ./
# Install all dependencies including devDependencies for build
RUN npm ci

COPY . .
RUN npm run build
# Prune dev dependencies
RUN npm prune --omit=dev --no-optional

# Run stage
FROM cgr.dev/chainguard/node:latest

WORKDIR /app

# Copy production artifacts
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY drizzle/migrations ./drizzle/migrations
COPY scripts/db-migrate.js ./scripts/db-migrate.js
COPY --from=builder /app/static ./static

EXPOSE 3000

ENV NODE_ENV=production

CMD ["build"]
