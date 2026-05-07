# Deployment Infrastructure

This directory holds Docker/compose recipes for self-hosting. **All
behavioral configuration lives elsewhere** — see
[`../deployments/README.md`](../deployments/README.md) for the brand,
classification, auth, and feature toggles. This directory only carries
the infra (which Dockerfile, which sidecars, which volumes).

## Two infra profiles

| Profile      | Path                                                              | Use when                                                                                                 |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Standard** | `deployment/Dockerfile` + `deployment/docker-compose.yml`         | Self-hosting on plain Docker; no special trust store or registry constraints                             |
| **DoD**      | `deployment/dod/Dockerfile` + `deployment/dod/docker-compose.yml` | Need DoD PKI certs baked into the trust store, hardened registry pulls, and Postgres permissions sidecar |

Vercel deployments use neither — they use SvelteKit's `adapter-vercel`
and pull `CONFIG_PATH` from Vercel env.

## Quick start (any profile)

```bash
# 1. Pick a deployment YAML (or write your own — see deployments/README.md)
# 2. Validate that your env satisfies its cascade:
set -a; source deployment/.env.dev-self; set +a
node scripts/check-deployment.js deployments/selfhosted.yaml
# Should print "✓ Ready to boot."

# 3. Bring up the stack:
cd deployment
docker compose up --build -d
docker compose run --rm app node scripts/db-migrate.js
```

For DoD: `cd deployment/dod` instead, and use `deployments/airmark.yaml`.

## What this directory used to do (and stopped doing)

Prior to the YAML config migration, these compose files declared
behavioral env vars (`PUBLIC_TITLE_VARIANT`, `PUBLIC_CLASSIFICATION`,
`PUBLIC_GUEST_MODE_DISABLED`, `AUTH_MOCK`, `DATABASE_DRIVER`,
`ORIGIN`, `ENABLE_CRON`). All of those are gone — behavior is now
selected by `CONFIG_PATH` pointing at one YAML. Only secrets and the
`CONFIG_PATH` bootstrap pointer belong in `environment:` blocks
going forward.

If you're adding a new env var here, ask: is it a secret? If yes, OK.
Otherwise it should probably be a YAML field instead.

## File layout

```
deployment/
├── Dockerfile                # Standard build (chainguard node base)
├── docker-compose.yml        # Standard stack (app + chainguard postgres)
├── .env.dev-self             # Standard secrets (do not commit real values)
├── README.md                 # This file
└── dod/
    ├── Dockerfile            # DoD build (Standard + cert layer)
    ├── docker-compose.yml    # DoD stack (app + db + fix-permissions sidecar)
    ├── .env.dod.example      # DoD secrets template
    ├── certs/                # DoD PKI cert chain (drop tenant certs here)
    ├── README.md             # DoD-specific setup notes
    └── DEPLOY.md             # DoD CI/CD operational notes
```

## Cascade-driven secrets

The validation cascade in
[`src/lib/config/load.server.ts`](../src/lib/config/load.server.ts)
declares which env vars each YAML toggle requires. Run
`node scripts/check-deployment.js deployments/<name>.yaml` to print
the exact list for your selected profile. Sample output:

```
Required env secrets (cascade):
  ✓ AUTH_USAF_ISSUER             (set)    — USAF OIDC provider
  ✓ AUTH_USAF_CLIENT_ID          (set)    — USAF OIDC provider
  ✗ AUTH_USAF_CLIENT_SECRET      MISSING  — USAF OIDC provider
  ...
✗ Boot would fail. Missing: AUTH_USAF_CLIENT_SECRET
```
