# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

DMS (Document Management System) — a NestJS 11 backend API with PostgreSQL, following DDD architecture. It manages files, folders, users/roles, sharing, audit logs, and NAS synchronization. See `docker-cheatsheet.md` for Docker commands and `src/integrations/sso/README.md` for SSO details.

### Services

| Service | Required | How to run |
|---------|----------|------------|
| NestJS API (port 3100) | Yes | `npm run start:dev` |
| PostgreSQL 16 (port 5432) | Yes | `sudo docker start dms-postgres` (already created) or `sudo docker run -d --name dms-postgres -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dms postgres:16-alpine` |
| Redis | No | Only needed when `QUEUE_TYPE=redis` |
| SeaweedFS | No | Only needed when `CACHE_STORAGE_TYPE=seaweedfs` |

### Running the app

1. Ensure Docker daemon is running: `sudo dockerd &>/tmp/dockerd.log &`
2. Start PostgreSQL: `sudo docker start dms-postgres`
3. Wait for PG readiness: `sudo docker exec dms-postgres pg_isready -U postgres`
4. Start dev server: `npm run start:dev` (watches for file changes)
5. Swagger docs: http://localhost:3100/api-docs

### Key dev caveats

- The `.env` file uses `envFilePath: '.env'` in `ConfigModule`. The `.env` must exist at the repo root with absolute paths for `NAS_MOUNT_PATH`, `QUEUE_LOCAL_PATH`, and `CACHE_LOCAL_PATH` (e.g., `/workspace/data/nas`). Relative paths cause `NAS_UNAVAILABLE` errors.
- `NODE_ENV=dev` activates MockSSO, which provides test users without a real SSO server.
- `DB_SYNCHRONIZE=true` in `.env` auto-syncs the TypeORM schema on startup (dev only).
- `docker-compose.yml` has a Windows-specific NAS volume mount (`C:\...`) that doesn't work on Linux — use standalone `docker run` for PostgreSQL instead of `docker compose up`.
- Test users are seeded via `npx ts-node scripts/seed-test-users.ts seed`. Credentials are in `docker-cheatsheet.md`.
- The app uses `@lumir-company/sso-sdk` (a private package). It's included in `package-lock.json` and installs fine with `npm ci`.

### Commands quick reference

- **Lint**: `npx eslint "{src,apps,libs,test}/**/*.ts"` (pre-existing warnings/errors exist)
- **Test**: `npm test` (some spec files have pre-existing DI failures; 32/55 suites pass)
- **Build**: `npm run build`
- **Dev server**: `npm run start:dev`
- **Seed users**: `npx ts-node scripts/seed-test-users.ts seed`
