# Configurations

Zod-validated environment config, app bootstrapping, logging, and DB wiring. Every env var read in the app should come through here — not from `process.env`.

## File map

- `index.config.ts` — top-level aggregator. **The** import path for validated env: `import { env } from 'src/configurations/index.config'`.
- `env/` — one file per feature area, each exporting a Zod schema + parsed object:
  - `server.env.ts`, `database.env.ts`, `redis.env.ts`, `jwt.env.ts`, `cors.env.ts`, `moodle.env.ts`, `bullmq.env.ts`, `openai.env.ts`, `admin.env.ts`, `r2.env.ts`, `report.env.ts`, `throttle.env.ts`.
  - `env.validation.ts` — composes the schemas, runs at startup, fails fast on invalid config.
  - `jwt-duration.util.ts` — parses duration strings (e.g. `"300s"`, `"30d"`).
  - `index.ts` — re-exports.
- `app/` — app-level factory/config.
- `common/` — shared constants (queue names, etc.).
- `database/` — MikroORM config glue.
- `factory/` — module-factory helpers.
- `lifecycle/` — app lifecycle hooks.
- `logger/` — logger configuration.

## Conventions

- **Add a new env var**: pick (or create) a file in `env/`, add the Zod schema entry, then register in `env.validation.ts`. The value flows through `index.config.ts` automatically.
- **Never read `process.env` directly** in feature code. If the value isn't in `env`, add it — future readers need a single source of truth.
- **Failing fast at startup** is intentional: an invalid env should crash the process at boot, not surface later as a runtime error.
- Duration-like env vars use `jwt-duration.util.ts` semantics (`"300s"`, `"30d"`). Don't reinvent parsing.

## Gotchas

- The env schema **runs before Nest builds the container** — if you add a new schema file, import it in `env.validation.ts` or the validation will silently skip it.
- Defaults live in the schemas, not in feature code. If a feature needs a different default, override via env, not via a `??` fallback at the call site.
- `r2.env.ts` + `report.env.ts` gate R2/report storage — they're optional but report generation will fail at runtime without them.

## Pointers

- Root `CLAUDE.md` — full env var reference (required + optional, with defaults).
