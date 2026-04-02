---
title: 'VPS Deployment Infrastructure'
slug: 'vps-deployment-infrastructure'
created: '2026-04-02'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'Express',
    'TypeScript ES2023',
    'MikroORM 6.6.11',
    'PostgreSQL + pgvector',
    'Redis 7 (ioredis 5.10)',
    'BullMQ 5.71',
    'Zod 4.3',
    'Pino',
    'Terminus',
    'Node 24',
  ]
files_to_modify:
  [
    'Dockerfile (new)',
    'docker-compose.deploy.yml (new)',
    'docker-compose.local-prod.yml (new)',
    'deploy/nginx/nginx.conf (new)',
    'deploy/postgres/init.sql (new)',
    'deploy/backup.sh (new)',
    '.github/workflows/deploy.yml (new)',
    '.env.staging.sample (new)',
    '.env.production.sample (new)',
  ]
code_patterns:
  [
    'auto-migrations on startup',
    'Zod env validation with fail-fast',
    'trust proxy for reverse proxy',
    'Terminus health checks (DB + Redis)',
    'graceful shutdown hooks',
    'nest-cli asset copying for report templates',
  ]
test_patterns:
  [
    'no deployment-specific tests — validation is via health checks and CI smoke tests',
  ]
---

# Tech-Spec: VPS Deployment Infrastructure

**Created:** 2026-04-02

## Overview

### Problem Statement

The Faculytics API has no production deployment setup — no production Dockerfile, no production-ready Docker Compose, and no CI/CD pipeline for deploying to a VPS. Development currently relies on free-tier cloud services (Redis Cloud, Neon Postgres) that are not suitable for staging or production environments.

### Solution

Build a complete deployment infrastructure: production multi-stage Dockerfile, Docker Compose stacks for local production-like testing and VPS deployment (staging + production), Nginx reverse proxy with SSL via Let's Encrypt, and GitHub Actions CI/CD for automated deploys to a Hostinger KVM2 VPS (2 vCPU, 8GB RAM, 100GB NVMe).

### Scope

**In Scope:**

- Production multi-stage Dockerfile for the NestJS API
- Docker Compose for local production-like stack (API + Redis + PostgreSQL w/ pgvector)
- Docker Compose for VPS with staging and production environments
- Nginx reverse proxy configuration with SSL (Let's Encrypt / Certbot)
- GitHub Actions CI/CD pipeline for deploy on merge to `staging` / `master`
- Environment variable management per environment
- PostgreSQL with pgvector extension provisioning
- Health check integration (Terminus is already installed)

**Out of Scope:**

- AI inference workers (deployed separately — URLs provided via env vars)
- R2 storage setup (already configured — credentials provided via env vars)
- Moodle instance deployment
- Monitoring/observability stack (Grafana, Prometheus, etc.)
- Data migration from Neon (current DB is disposable)
- Kubernetes / container orchestration

## Context for Development

### Codebase Patterns

- **Bootstrap flow:** `main.ts` → create app → `trust proxy = 1` → apply configs → run migrations + seed → enable shutdown hooks → listen on `PORT`
- **Auto-migrations:** `database-initializer.ts` runs `orm.migrator.up()` + `orm.seeder.seed(DatabaseSeeder)` on every startup — no separate migration command needed in deployment
- **Env validation:** Zod schemas in `src/configurations/env/` validate all vars at startup; exits with code 1 on failure — container won't start with bad config
- **Health endpoint:** `GET /api/v1/health` checks Postgres (`SELECT 1`) and Redis (set/get test key) — ideal for Docker health probes
- **Graceful shutdown:** `app.enableShutdownHooks()` handles SIGTERM/SIGINT — cron jobs and processors shut down cleanly
- **Report templates:** `nest-cli.json` copies `modules/reports/templates/**/*` to `dist/` during build — must be included in Docker image
- **Redis shared:** BullMQ, cache-manager, and throttler all connect to same `REDIS_URL` — key-prefix isolation via `REDIS_KEY_PREFIX`
- **Neon detection:** `mikro-orm.config.ts` auto-detects Neon URLs and adjusts SSL — self-hosted Postgres gets `ssl: false` automatically
- **Structured logging:** Pino with JSON output, request IDs, header redaction — production-ready out of the box
- **API versioning:** URI-based at `/api/v1/` — Nginx proxy_pass targets this prefix

### Files to Reference

| File                                                  | Purpose                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `src/main.ts`                                         | App bootstrap — trust proxy, port resolution, shutdown hooks          |
| `mikro-orm.config.ts`                                 | Database config — Neon detection, migration paths, soft delete filter |
| `src/configurations/env/`                             | All Zod env schemas — defines every required/optional env var         |
| `src/configurations/index.config.ts`                  | Central `env` export — parsed once at module load                     |
| `src/configurations/database/database-initializer.ts` | Auto-migration + seeding on startup                                   |
| `src/modules/health/`                                 | Terminus health checks — DB + Redis status                            |
| `src/app.module.ts`                                   | Module registration — infra + app modules, cron jobs, throttle guard  |
| `docker-compose.yml`                                  | Existing dev-only Compose — Redis + mock-worker (remains unchanged)   |
| `mock-worker/Dockerfile`                              | Existing Dockerfile pattern — Node 24 Alpine base                     |
| `.github/workflows/pr-test.yml`                       | CI test workflow — Postgres 15 + Redis 7 services pattern             |
| `.github/workflows/publish-contract.yml`              | Contract publish — deploy pattern with dummy env vars                 |
| `package.json`                                        | Scripts (`build`, `start:prod`), dependencies, Node version           |
| `nest-cli.json`                                       | Asset config — report templates copied to dist                        |
| `tsconfig.build.json`                                 | Build excludes — test files, node_modules                             |
| `.env.sample`                                         | Full env var documentation                                            |

### Technical Decisions

- **VPS Provider:** Hostinger KVM2 (2 vCPU, 8GB RAM, 100GB NVMe, 8TB bandwidth)
- **Reverse Proxy:** Nginx with SSL via Let's Encrypt / Certbot
- **Database:** Single PostgreSQL container with two databases (`faculytics_staging`, `faculytics_prod`) — shared engine, application-level isolation via separate `DATABASE_URL` per environment
- **pgvector:** Enabled per-database via init SQL script
- **Cache/Queue:** Single Redis container with key-prefix isolation (`faculytics:staging:`, `faculytics:prod:`)
- **AI Workers:** External endpoints (RunPod etc.) — URLs provided via env vars
- **R2 Storage:** Cloudflare R2 — credentials provided via env vars
- **CI/CD:** GitHub Actions — automated deploy on merge to `staging` / `master`
- **Domain:** Already acquired and ready
- **Docker Compose Profiles:** Single `docker-compose.deploy.yml` with `staging` / `production` profiles
- **Volume Strategy:** External named volumes (`pg_data`, `redis_data`) created manually during VPS setup — immune to `docker compose down -v`
- **Build Strategy:** Build on VPS initially; migrate to GHCR when build times become painful
- **Nginx Routing:** Two server blocks — `api.faculytics.ctr3.org` → production, `staging.api.faculytics.ctr3.org` → staging
- **Container Memory Limits:** Postgres 2GB, Redis 512MB, API-prod 1.5GB, API-staging 1GB — prevents OOM killer from taking down the VPS
- **Postgres Tuning:** `shared_buffers=512MB`, `work_mem=8MB` — set via Compose command args, no mounted config
- **Docker Log Rotation:** `daemon.json` with `max-size: 10m`, `max-file: 3` — prevents silent disk fill
- **Certbot Renewal Hook:** Auto-reload Nginx on certificate renewal — prevents 90-day SSL expiry outage
- **Deploy User:** Dedicated `deploy` user with Docker group access for CI/CD — not root
- **Image Pruning:** Scheduled `docker system prune` to clean old build layers from build-on-VPS strategy
- **Database Backups:** Daily `pg_dump` per database to local `/backups` directory with 7-day rotation — included from day one

## Implementation Plan

### Tasks

#### Phase 1: Container Foundation

- [ ] Task 1: Create `.dockerignore`
  - File: `.dockerignore` (new)
  - Action: Create Docker ignore file to exclude `node_modules`, `.git`, `dist`, `.env*`, `test/`, `*.md`, `_bmad*/`, `_bmad-output/`, `docs/`, `.github/`, `mock-worker/`, `coverage/`
  - Notes: Keeps build context small and fast; prevents secrets from leaking into image

- [ ] Task 2: Create production multi-stage Dockerfile
  - File: `Dockerfile` (new)
  - Action: Create multi-stage Dockerfile with:
    - **Stage 1 (`build`):** `FROM node:24-alpine AS build`, `WORKDIR /app`, copy `package.json` + `package-lock.json`, `npm ci`, copy source, `npm run build`
    - **Stage 2 (`production`):** `FROM node:24-alpine`, `WORKDIR /app`, copy `package.json` + `package-lock.json` from build, `npm ci --omit=dev`, copy `dist/` from build stage, `ENV NODE_ENV=production`, `EXPOSE 5200`, `CMD ["node", "dist/main"]`
  - Notes: Report templates are included in `dist/` via nest-cli asset copying during build stage. No dev dependencies in final image. Alpine base for minimal footprint (~150MB). No `HEALTHCHECK` in the Dockerfile — health checks are defined per-service in the Compose files instead, allowing each context (local-prod vs deploy) to tune intervals and timeouts independently.

#### Phase 2: Database & Support Scripts

- [ ] Task 3: Create Postgres init SQL script
  - File: `deploy/postgres/init.sql` (new)
  - Action: Create SQL initialization script:

    ```sql
    -- Create databases
    CREATE DATABASE faculytics_staging;
    CREATE DATABASE faculytics_prod;

    -- Enable pgvector on each database
    \c faculytics_staging
    CREATE EXTENSION IF NOT EXISTS vector;

    \c faculytics_prod
    CREATE EXTENSION IF NOT EXISTS vector;
    ```

  - Notes: Runs once on first Postgres container start via Docker entrypoint (`/docker-entrypoint-initdb.d/`). The default `postgres` database is created automatically. App migrations handle schema creation from there.

- [ ] Task 4: Create database backup script
  - File: `deploy/backup.sh` (new)
  - Action: Create shell script that:
    - Runs `pg_dump` for `faculytics_staging` and `faculytics_prod` separately
    - Outputs to `/backups/` with timestamped filenames (e.g., `faculytics_prod_2026-04-02.sql.gz`)
    - Compresses with gzip
    - Deletes backups older than 7 days
    - Logs success/failure to stdout (captured by Docker log driver)
  - Notes: Script runs via cron on the VPS host. Uses `docker exec` to run `pg_dump` inside the Postgres container, or connects via the exposed Postgres port. Make executable with `chmod +x`.

#### Phase 3: Nginx Configuration

- [ ] Task 5: Create Nginx configuration
  - File: `deploy/nginx/nginx.conf` (new)
  - Action: Create Nginx config with:
    - **HTTP block:** Redirect all HTTP to HTTPS
    - **Production server block:** Listen 443 SSL, `server_name api.{domain}`, `proxy_pass http://api-production:5200`, SSL cert paths for Certbot, proxy headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `Host`), WebSocket upgrade headers (for potential future use)
    - **Staging server block:** Listen 443 SSL, `server_name staging-api.{domain}`, `proxy_pass http://api-staging:5201`, separate SSL cert paths
    - **Shared settings:** `client_max_body_size 10m` (for file uploads), gzip on, proxy timeouts (60s connect, 120s read — accounts for long-running analysis requests)
  - Notes: Uses Docker DNS to resolve service names (`api-production`, `api-staging`). SSL certs managed by Certbot on the host and mounted into the Nginx container. Placeholder domain values to be replaced during VPS setup.

#### Phase 4: Docker Compose Files

- [ ] Task 6: Create VPS deployment Docker Compose
  - File: `docker-compose.deploy.yml` (new)
  - Action: Create Compose file with profiles:
    - **`postgres` service:** `image: pgvector/pgvector:pg15`, mount `deploy/postgres/init.sql` to `/docker-entrypoint-initdb.d/`, external volume `pg_data`, `command: postgres -c shared_buffers=512MB -c work_mem=8MB`, memory limit 2GB, health check via `pg_isready`
    - **`redis` service:** `image: redis:7-alpine`, `command: redis-server --maxmemory 256mb --maxmemory-policy noeviction`, external volume `redis_data`, memory limit 512MB, health check via `redis-cli ping`
    - **`api-production` service (profile: production):** Build from `Dockerfile`, `PORT=5200`, `NODE_ENV=production`, `REDIS_KEY_PREFIX=faculytics:prod:`, `env_file: .env.production`, depends on postgres + redis (healthy), memory limit 1.5GB, restart `unless-stopped`
    - **`api-staging` service (profile: staging):** Build from `Dockerfile`, `PORT=5201`, `NODE_ENV=production`, `REDIS_KEY_PREFIX=faculytics:staging:`, `env_file: .env.staging`, depends on postgres + redis (healthy), memory limit 1GB, restart `unless-stopped`
    - **`nginx` service:** `image: nginx:alpine`, mount `deploy/nginx/nginx.conf` to `/etc/nginx/nginx.conf:ro`, mount Certbot cert dirs, ports `80:80` and `443:443`, **no `depends_on` for API services** (Nginx starts independently — Docker DNS resolves service names at request time; returns 502 until APIs are healthy), restart `unless-stopped`
    - **Volumes:** `pg_data` and `redis_data` declared as `external: true`
    - **Network:** Default bridge network (all services share it — Docker DNS resolves service names)
  - Notes: Use `pgvector/pgvector:pg15` image which has pgvector pre-installed (avoids manual extension building). Staging API listens on port 5201 internally — Nginx routes by subdomain. Both API services set `NODE_ENV=production` since staging should behave like production. The `env_file` directive loads environment-specific vars. Health checks for API services are defined here (not in the Dockerfile) using `test: ["CMD", "node", "-e", "fetch('http://localhost:${PORT}/api/v1/health').then(r => process.exit(r.ok ? 0 : 1))"]` with configurable interval/timeout per service.

- [ ] Task 7: Create local production-like Docker Compose
  - File: `docker-compose.local-prod.yml` (new)
  - Action: Create simplified Compose for local testing:
    - **`postgres` service:** Same as deploy but with port `5432:5432` exposed to host, non-external volume
    - **`redis` service:** Same as deploy but with port `6379:6379` exposed to host, non-external volume
    - **`api` service:** Build from `Dockerfile`, `PORT=5200`, `NODE_ENV=production`, `env_file: .env.local-prod`, depends on postgres + redis, port `5200:5200` exposed
    - No Nginx — access API directly on `localhost:5200`
    - No profiles — single environment
  - Notes: Purpose is to verify the production Dockerfile builds and runs correctly before deploying to VPS. Mirrors the VPS stack minus Nginx/SSL and profiles. Ports exposed to host for direct testing.

#### Phase 5: Environment Templates

- [ ] Task 8: Create environment sample files
  - File: `.env.staging.sample` (new), `.env.production.sample` (new)
  - Action: Create environment templates based on `.env.sample` with:
    - **Shared across both:** All required env vars with placeholder values
    - **Staging-specific:** `PORT=5201`, `REDIS_KEY_PREFIX=faculytics:staging:`, `DATABASE_URL=postgresql://faculytics:password@postgres:5432/faculytics_staging`, `CORS_ORIGINS` pointing to staging frontend URL, `SUPER_ADMIN_PASSWORD` with a note to change, `SYNC_ON_STARTUP=true`
    - **Production-specific:** `PORT=5200`, `REDIS_KEY_PREFIX=faculytics:prod:`, `DATABASE_URL=postgresql://faculytics:password@postgres:5432/faculytics_prod`, `CORS_ORIGINS` pointing to production frontend URL, `SUPER_ADMIN_PASSWORD` with a strong value, `SYNC_ON_STARTUP=true`
    - Both include comments explaining each variable group
  - Notes: The actual `.env.staging` and `.env.production` files are never committed — only the samples. `DATABASE_URL` uses Docker service name `postgres` as hostname (resolved by Docker DNS within the Compose network). The Postgres user/password should match the `POSTGRES_USER`/`POSTGRES_PASSWORD` set on the postgres service in the Compose file.

#### Phase 6: CI/CD Pipeline

- [ ] Task 9: Create GitHub Actions deploy workflow
  - File: `.github/workflows/deploy.yml` (new)
  - Action: Create workflow with:
    - **Triggers:** Push to `staging` branch (deploy staging), push to `master` branch (deploy production)
    - **Build strategy:** Uses `git fetch` + `git archive` to extract the target branch into a temp directory for building — avoids branch switching on the VPS since staging and production deploy from different branches to the same repo clone
    - **Jobs:**
      - `deploy-staging` (runs on push to `staging`):
        1. Checkout code
        2. SSH into VPS as `deploy` user
        3. `cd /opt/faculytics && git fetch origin staging`
        4. `mkdir -p /tmp/faculytics-build && git archive origin/staging | tar -x -C /tmp/faculytics-build`
        5. `docker build -t faculytics-api:staging -f /tmp/faculytics-build/Dockerfile /tmp/faculytics-build`
        6. `rm -rf /tmp/faculytics-build`
        7. `docker compose -f docker-compose.deploy.yml --profile staging up -d api-staging`
        8. Wait 10s, then hit `http://localhost:5201/api/v1/health` — fail workflow if unhealthy
        9. `docker system prune -f --filter "until=168h"` (clean old images)
        10. Discord notification with result
      - `deploy-production` (runs on push to `master`):
        1. Same flow but `git fetch origin master`, `git archive origin/master`, builds as `faculytics-api:production`
        2. `docker compose --profile production up -d api-production`
        3. Health check on `http://localhost:5200/api/v1/health`
        4. Discord notification with result
    - **Secrets required:** `VPS_HOST`, `VPS_SSH_KEY`, `VPS_DEPLOY_USER`, `DISCORD_WEBHOOK_URL`
    - **SSH action:** Use `appleboy/ssh-action` (widely used, same pattern as existing workflows)
  - Notes: The `git archive` approach extracts branch content to a temp directory without switching branches — the repo clone at `/opt/faculytics` stays branch-agnostic. Build happens on VPS (no registry needed). Health check after deploy validates the new container started correctly. Image pruning runs post-deploy to keep disk clean. The `--profile` flag ensures only the target environment's API container is rebuilt/restarted — shared services (postgres, redis, nginx) remain untouched. The Compose file itself stays on disk at `/opt/faculytics` and is updated manually or via a separate fetch when infra config changes.

#### Phase 7: VPS Bootstrap Documentation

- [ ] Task 10: Create VPS setup guide
  - File: `deploy/VPS-SETUP.md` (new)
  - Action: Create step-by-step bootstrap guide covering:
    1. **Initial VPS access:** SSH as root, update packages
    2. **Create deploy user:** `useradd -m -s /bin/bash deploy`, add to `docker` group, set up SSH key for CI/CD
    3. **Install Docker Engine + Compose v2:** Official Docker install script
    4. **Install Nginx + Certbot:** Via apt (Nginx runs on host or in container — document both, recommend container)
    5. **Configure Docker daemon:** Create `/etc/docker/daemon.json` with log rotation (`max-size: 10m`, `max-file: 3`), restart Docker
    6. **Create external volumes:** `docker volume create pg_data && docker volume create redis_data`
    7. **Clone repository:** `git clone` to `/opt/faculytics`, set ownership to `deploy` user. The repo stays branch-agnostic on the VPS — CI/CD uses `git fetch` + `git archive` to extract branch content for builds without switching branches
    8. **Create env files:** Copy `.env.staging.sample` → `.env.staging`, `.env.production.sample` → `.env.production`, fill in real values
    9. **SSL certificates:** Run Certbot for both domains (`api.domain.com`, `staging-api.domain.com`), configure renewal hook to reload Nginx
    10. **First deploy:** `docker compose -f docker-compose.deploy.yml --profile staging --profile production up -d`
    11. **Set up backup cron:** `crontab -e`, add daily `deploy/backup.sh` execution at 3 AM
    12. **Set up image pruning cron:** Weekly `docker system prune -f --filter "until=168h"`
    13. **Verify:** Hit health endpoints, check logs with `docker compose logs -f`
  - Notes: This is a one-time setup guide, not an automated script. Keeping it as a guide allows the operator to understand each step and adapt to Hostinger-specific quirks. Future improvement: convert to an Ansible playbook.

### Acceptance Criteria

#### Container Build

- [ ] AC 1: Given the production Dockerfile, when `docker build -t faculytics-api .` is run, then the image builds successfully with no errors and the final image is under 300MB
- [ ] AC 2: Given the built Docker image, when `docker run -e ... faculytics-api` is run with valid env vars pointing to Postgres + Redis, then the API starts, runs migrations, seeds the database, and responds to `GET /api/v1/health` with `{ status: 'ok' }`
- [ ] AC 3: Given the built Docker image, when run with missing required env vars (e.g., no `DATABASE_URL`), then the container exits with code 1 and logs the Zod validation error

#### Local Production Stack

- [ ] AC 4: Given `docker-compose.local-prod.yml` and a valid `.env.local-prod`, when `docker compose -f docker-compose.local-prod.yml up` is run, then Postgres (with pgvector), Redis, and the API all start and the health endpoint returns `{ status: 'ok' }`
- [ ] AC 5: Given the local production stack is running, when a request is made to `GET http://localhost:5200/api/v1/health`, then both `database` and `redis` indicators show `status: 'up'`

#### VPS Deployment Stack

- [ ] AC 6: Given `docker-compose.deploy.yml` with external volumes created, when `docker compose --profile staging up -d` is run, then postgres, redis, api-staging, and nginx containers start with health checks passing
- [ ] AC 7: Given `docker-compose.deploy.yml` with external volumes created, when `docker compose --profile production up -d` is run, then postgres, redis, api-production, and nginx containers start with health checks passing
- [ ] AC 8: Given both profiles are active, when staging and production APIs are running simultaneously, then they use separate databases (`faculytics_staging` vs `faculytics_prod`) and separate Redis key prefixes (`faculytics:staging:` vs `faculytics:prod:`) with no cross-contamination

#### Nginx & SSL

- [ ] AC 9: Given Nginx is configured and SSL certs are provisioned, when a request is made to `https://api.{domain}/api/v1/health`, then it proxies to the production API and returns a valid response with a valid SSL certificate
- [ ] AC 10: Given Nginx is configured, when a request is made to `http://api.{domain}/api/v1/health` (HTTP), then it redirects to HTTPS (301)

#### CI/CD Pipeline

- [ ] AC 11: Given a merge to the `staging` branch, when the GitHub Actions deploy workflow triggers, then it SSHes into the VPS, rebuilds only the staging API container, restarts it, and verifies health — reporting success/failure to Discord
- [ ] AC 12: Given a merge to the `master` branch, when the deploy workflow triggers, then it deploys the production API following the same pattern as staging

#### Resilience

- [ ] AC 13: Given a running API container, when it crashes or is killed, then Docker restarts it automatically via `restart: unless-stopped` and the health check eventually passes
- [ ] AC 14: Given the Postgres container has a 2GB memory limit, when memory usage approaches the limit, then the container is constrained (not the host OOM killer) and other containers remain unaffected
- [ ] AC 15: Given `docker compose down` is run (without `-v`), when the stack is brought back up, then Postgres data and Redis data persist via external volumes

## Additional Context

### Dependencies

- **No new npm dependencies required** — all deployment infra is Docker/Nginx/CI config
- **External services (credentials provided via env):** Moodle LMS, OpenAI API, Cloudflare R2, AI inference workers (RunPod)
- **VPS prerequisites:** Docker Engine, Docker Compose v2, Nginx, Certbot, Node 24 (for build stage only)
- **GitHub secrets required for CI/CD:** SSH private key, VPS host IP, deploy user credentials, env var files per environment
- **Postgres 15+ with pgvector extension** — installed via `apt` or `CREATE EXTENSION` in init SQL
- **Redis 7+** — Alpine image, `maxmemory-policy noeviction` (matches existing dev config)

### Testing Strategy

**No unit/integration tests for deployment infrastructure.** Validation is done through:

1. **Local build test:** Build the Dockerfile locally, verify it produces a working image (`docker build -t faculytics-api .`)
2. **Local stack test:** Run `docker-compose.local-prod.yml`, hit health endpoint, verify DB + Redis connectivity
3. **Compose validation:** `docker compose -f docker-compose.deploy.yml config` to lint the Compose file
4. **CI/CD smoke test:** The deploy workflow itself includes a post-deploy health check — if the API doesn't respond healthy within 30s, the deploy is marked failed
5. **SSL verification:** After VPS setup, verify SSL with `curl -I https://api.{domain}/api/v1/health` and check certificate validity
6. **Backup verification:** After first backup cron run, verify `.sql.gz` files exist in `/backups/` and can be restored with `pg_restore`

### Notes

- No live users yet — early stage, so deployment can be iterated on without migration concerns
- Current database is disposable — no data migration needed from Neon
- The existing `docker-compose.yml` is development-only (Redis + mock-worker) and will remain as-is
- `mikro-orm.config.ts` already handles Neon vs standard Postgres via auto-detection — no changes needed
- **Upgrade path:** When real users arrive, split production to its own VPS by pointing `DATABASE_URL` at a new Postgres instance — architecture supports this cleanly
- **Deferred:** GHCR image registry, off-site backups to R2, monitoring stack (Grafana/Prometheus), rollback image tagging, SSH `command=` restriction, Postgres WAL tuning
