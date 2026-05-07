# Quick Deployment

1. **Setup Config**
   Copy the example environment file:

   ```bash
   cp .env.dod.example .env.dod
   ```

   Edit `.env.dod` and set the following required secrets:
   - `AUTH_SECRET`
   - `AUTH_USAF_CLIENT_ID`
   - `AUTH_USAF_CLIENT_SECRET`

2. **Start Services**

   ```bash
   docker compose up -d
   ```

3. **Initialize Database** (First run only)

   ```bash
   docker compose exec app node scripts/db-migrate.js
   ```

4. **Automated Deployment**

   Deployment is automated via GitLab CI/CD. The pipeline builds and pushes the application image to `registry.omni.af.mil`.

   **Requirements:**
   - Configure the following CI/CD variables in your GitLab project:
     - `REGISTRY_URL`: The full URL of the registry (e.g. `registry.git.mil`)
     - `REGISTRY_ACCESS_TOKEN`: Access token for the registry (user `robit`)

   **Process:**
   - behaviors: Push a **tag** (e.g. `v1.0.0`) to trigger the build and push of the entire stack (app and db).
   - The pipeline uses `docker compose` to ensure the build configuration matches your local environment.
   - To update the deployed service, pull the new image on the server:
     ```bash
     docker compose pull app
     docker compose up -d app
     ```
