# Self-Hosting with Docker

This guide provides instructions for deploying TongueToQuill using Docker and Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed.
- [Docker Compose](https://docs.docker.com/compose/install/) installed.
- Access to the `dhi.io` container registry.

## Setup Instructions

### 1. Log in to the Container Registry

Log in to the registry using your Personal Access Token (PAT):

```bash
docker login dhi.io
```

### 2. Pull Required Images

Pull the necessary images for the application and database:

```bash
docker pull dhi.io/node:24
docker pull dhi.io/postgres:18
```

### 3. Start the Services

Start the application and database containers in detached mode:

```bash
docker compose up -d --build
```

> [!NOTE]
> The `--build` flag ensures that the local Dockerfile is built using the pulled base images.

### 4. Sync the Database

Once the services are up, run the database migration script to synchronize the schema:

```bash
docker compose run --rm app node scripts/db-migrate.js
```

## Configuration

The application configuration is managed via environment variables.

### Environment Variables

In a self-hosted environment, you should configure the following variables in a `.env` file or within `docker-compose.yml`:

- `DATABASE_URL`: The connection string for the Postgres database (e.g., `postgresql://postgres:postgres@db:5432/tonguetoquill`).
- `ORIGIN`: The public URL where the application will be accessible (e.g., `https://your-domain.com`). This is required for SvelteKit CSRF protection.
- `NODE_ENV`: Set to `production` for optimal performance.

By default, the `docker-compose.yml` uses `.env.dev-self` for development-like self-hosting. For production, create a dedicated `.env` file.

## Troubleshooting

- **Database Connection**: Ensure the `db` service is healthy before running migrations. You can check logs with `docker compose logs -f db`.
- **Port Mapping**: The default configuration maps port `3000` to the host. Ensure this port is available or modify `docker-compose.yml`.
- **Migrations**: If migrations fail, check the `DATABASE_URL` and ensure the database container is reachable from the `app` container.
