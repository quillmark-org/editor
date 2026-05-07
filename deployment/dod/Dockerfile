# syntax=docker/dockerfile:1.7

# Build stage
FROM node:24 AS builder

WORKDIR /app

COPY package*.json ./
# Install all dependencies including devDependencies for build.
# BuildKit cache mount persists npm's download cache across builds.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Build the application
RUN npm run build

# --- utility jobs can use this target (before dev deps are pruned) ---
FROM builder AS dev

# Prune dev dependencies
FROM builder AS pruned
RUN npm prune --omit=dev --no-optional

# Add DoD certificates to CA bundle
COPY deployment/dod/certs/*.pem /tmp/dod-certs/
RUN cat /tmp/dod-certs/*.pem >> /etc/ssl/certs/ca-certificates.crt

# Run stage
FROM cgr.dev/chainguard/node:latest

WORKDIR /app

# Copy production artifacts
COPY --chown=node:node --from=pruned /app/build ./build
COPY --chown=node:node --from=pruned /app/node_modules ./node_modules
COPY --chown=node:node --from=pruned /app/package.json ./package.json
COPY --chown=node:node drizzle/migrations ./drizzle/migrations
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node --from=pruned /app/static ./static

# Copy modified CA bundle with DoD certificates
COPY --chown=node:node --from=pruned /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Set Node.js to use system CA bundle
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

EXPOSE 3000

ENV NODE_ENV=production

CMD ["build"]
