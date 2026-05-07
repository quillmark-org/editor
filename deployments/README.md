# Deployment Configuration

Each file in this directory describes one deployment. Selecting a file is the
**only** decision an operator makes about behavior — everything else (brand,
classification policy, auth providers, feature flags, database driver) flows
from the YAML.

## How a deployment is loaded

```
process.env.CONFIG_PATH  →  deployments/<file>.yaml  →  ConfigSchema.parse  →  cascade  →  frozen Config
```

1. **`CONFIG_PATH`** env var selects which YAML to load. Required at boot —
   there is deliberately no default, so a missing value fails fast rather than
   silently picking up `dev.yaml`. Local dev sets it via `.env.dev` (Vite loads
   that file automatically via `--mode dev`). This is the only env var that
   influences behavior.
2. The YAML is parsed and validated against the Zod schema in
   [`src/lib/config/schema.ts`](../src/lib/config/schema.ts). Unknown fields,
   wrong types, and invalid combinations (e.g. `guestMode: false` with no auth
   providers enabled) fail at boot.
3. The **cascade** in [`src/lib/config/load.server.ts`](../src/lib/config/load.server.ts)
   walks `SECRET_REQUIREMENTS` and asserts that every behavioral toggle's
   required env-var secrets are set. Missing secrets are reported as one error
   with the full list.
4. The result is frozen and cached for the lifetime of the process.

## The taxonomy

| Lives in YAML                                   | Lives in env                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| Brand identity (titles, urls, copyright)        | Secrets (`AUTH_*`, `DATABASE_URL`, `CRON_SECRET`, `FEEDBACK_*_KEY/URL`) |
| Classification (label, banner, session age)     | The `CONFIG_PATH` bootstrap pointer                                     |
| Auth provider toggles (`enabled: true/false`)   | Vercel-injected env (`VERCEL`, `VERCEL_URL`, `VERCEL_ENV`)              |
| Feature toggles (`mobile`, `feedback.upstream`) |                                                                         |
| `db.driver` (`pglite` / `pg` / `neon`)          |                                                                         |

If you find yourself wanting to put behavior in env or secrets in YAML, stop
and reconsider — the split is deliberate.

## Adding a new tenant

1. **Copy a reference YAML** that's structurally close to what you need:
   - `selfhosted.yaml` — TongueToQuill-style self-hosted Postgres with OAuth
   - `airmark.yaml` — DoD CUI with OIDC, no guest mode
   - `tonguetoquill.yaml` — Vercel/Neon production, public-facing
   - `dev.yaml` — local dev with mock auth + pglite
2. **Override what differs.** Anything you omit gets a sensible default from
   the schema (see "Defaults" below). Brand fields are required — they
   define your tenant identity.
3. **Run the readiness check** with your env loaded:
   ```bash
   set -a; source .env; set +a
   node scripts/check-deployment.js deployments/yourtenant.yaml
   ```
   The script reports exactly which secrets the cascade requires and which
   are missing. Fix anything red, repeat until green.
4. **Set `CONFIG_PATH`** in your runtime environment (Docker compose, Vercel
   env, systemd unit, etc.) to point at your new file.

## Defaults (what you can omit)

The schema sets reasonable defaults for operational fields. A minimal YAML
need only declare brand identity, `auth.guestMode`, and `db.driver`:

```yaml
brand:
  # ... (all brand fields are required — they're per-tenant identity)
auth:
  guestMode: true
  providers:
    mock: { enabled: true } # other providers default to disabled
db:
  driver: pglite
# classification: omit → defaults to unclassified, no banner, weeklong session
# features: omit entirely → defaults to { mobile: true, feedback: none }
```

CUI deployments compose the classification primitives explicitly (see below).
Production deployments declare the providers they enable and the feedback
upstream.

## Adding a new auth provider, feature, or db driver

Two-step change:

1. **Add the field to the schema** in `src/lib/config/schema.ts`.
2. **Add an entry to `SECRET_REQUIREMENTS`** in the same file, declaring
   which env vars the toggle requires (the `vars` callback receives the
   parsed config, so you can derive env-var names from YAML fields like
   `oidc.envPrefix`).

The cascade picks up the new entry automatically. Consumer code can read
the new toggle directly via `getServerConfig()`.

## Adding an OIDC provider for your tenant

The `auth.providers.oidc` slot is generic — any standards-compliant
OIDC IdP (Keycloak, Okta, Auth0, Authentik, your in-house issuer) works
without code changes. Sample tenant block:

```yaml
auth:
  guestMode: false
  providers:
    oidc:
      id: tenant-sso # auth.js callback URL slug; must match what's registered with the IdP
      name: 'Tenant SSO' # display name on the signin button
      issuer: https://idp.tenant.example/realms/main
      scopes: [openid, email, profile] # default — override if your IdP needs more
      envPrefix: AUTH_TENANT # default is AUTH_OIDC; set to keep existing secret names
```

The cascade then requires `${envPrefix}_CLIENT_ID` and
`${envPrefix}_CLIENT_SECRET` as env-var secrets. Existing tenants
(airmark) use `envPrefix: AUTH_USAF` so their `AUTH_USAF_CLIENT_ID`
secrets keep working.

## Customizing per-tenant assets

`brand.meta.icons` defaults to shared paths (`/favicon.svg`, `/logo.svg`,
`/pwa-192x192.png`, `/pwa-512x512.png`). Drop your tenant-specific
files in `static/` and override:

```yaml
brand:
  meta:
    icons:
      favicon: /tenant-favicon.svg
      logo: /tenant-logo.svg
      pwa192: /tenant-pwa-192x192.png
      pwa512: /tenant-pwa-512x512.png
```

## CUI deployments

The schema is intentionally agnostic about classification regimes — there's
no `category: cui` flag that bundles policy behind a single switch. A CUI
deployment composes the primitives directly. Reference: `airmark.yaml`.

```yaml
classification:
  label: 'Dynamic Content - Max Content - CUI' # banner text
  showBanner: true # render the marking banner
  bannerTone: cui # purple per CUI guidance
  useInternalTerms: true # link the in-app /terms (USG consent)
  sessionMaxAgeSeconds: 3600 # tightened session window
```

The `bannerTone` enum (`unclassified` | `cui`) is the one place where the
schema constrains rather than just primitives — marking colors carry
semantic meaning, so the visual tone is a fixed enum rather than free-form
input.

Drift on CUI tenants is guarded by snapshot tests in
`src/lib/config/load.server.test.ts` (see `CUI deployment snapshots`).
Adding a new CUI tenant: copy the `airmark.yaml` block above and add a
matching snapshot test.

## See also

- [`src/lib/config/schema.ts`](../src/lib/config/schema.ts) — full type
  definitions and `SECRET_REQUIREMENTS` registry
- [`src/lib/config/load.server.ts`](../src/lib/config/load.server.ts) —
  loader, cascade, and the env-vs-YAML taxonomy comment
- [`src/lib/config/load.server.test.ts`](../src/lib/config/load.server.test.ts) —
  18 golden cases covering schema validation, defaults, and every cascade
  rule
- [`deployment/README.md`](../deployment/README.md) — Docker/infra side
