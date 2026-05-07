# DoD Docker Deployment Guide

This guide covers building and running the DoD-configured Docker image for Tonguetoquill-Web with USAF OIDC authentication.

## Prerequisites

- Docker and Docker Compose installed
- DoD OIDC credentials (client ID, secret, issuer URL)

## Configuration

Copy the example configuration:

```bash
cd deployment/dod
cp .env.dod.example .env.dod
```

Edit `.env.dod` with your DoD credentials:

```bash
# OIDC Configuration
AUTH_USAF_ISSUER=https://identity.omni.af.mil/realms/OMNI
AUTH_USAF_CLIENT_ID=tonguetoquill-web
AUTH_USAF_CLIENT_SECRET=your-client-secret-here

# Production Domain
ORIGIN=https://tonguetoquill.your-domain.mil

# Auth Secret (generate with: openssl rand -base64 32)
AUTH_SECRET=your-generated-secret-here

# Database
DATABASE_URL=postgresql://postgres:postgres@db:5432/tonguetoquill

# Mock Authentication (Staging/Testing Only - NEVER in Production)
AUTH_MOCK=false
```

### Notes

- Configure redirect URI in OIDC provider:`https://airmark.omni.af.mil/auth/callback/usaf`
- Auth providers are automatically surfaced in UI when configured. Set `AUTH_MOCK=true` to enable the mock authentication provider.
- For additional DoD certs, copy the `.pem` files to `deployment/dod/certs/` before building. The standard DoD CA chain is already included.

## Build and Run

### Using Docker Compose (Recommended)

From the `deployment/dod` directory:

```bash
# Build and start services
docker compose --env-file .env.dod up -d

# Run database migrations against postgresql from node image
docker compose --env-file .env.dod exec app node scripts/db-migrate.js

# View logs
docker compose --env-file .env.dod logs -f app
```

## Access the Application

Navigate to: `http://localhost:3000` (or your configured ORIGIN)

Login page will display the **USAF Login** button.

## Troubleshooting

### macOS Local Volume "Permission denied"

Because the Chainguard Postgres image is strictly rootless (runs as `postgres`, UID `70`), it cannot write to newly created Docker named volumes on macOS (which are created by `root`).

If you see a `Permission denied` error for `/var/lib/postgresql/data/pgdata` when running `docker compose up`, you must perform a one-time permission fix on the volume.

Run this command once:

```bash
docker run --rm \
  -v airmark_db-data:/var/lib/postgresql/data \
  --user root \
  --entrypoint chown \
  registry.omni.af.mil/tonguetoquill/ttq-db:latest \
  -R postgres:postgres /var/lib/postgresql/data
```

After running this, your `docker compose --env-file .env.dod up` command will work normally.
