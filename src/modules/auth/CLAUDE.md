# Auth Module

Login, refresh, and logout. Uses a priority-based Strategy pattern so multiple authentication sources (local passwords, Moodle tokens, future providers) compose cleanly.

## File map

- `auth.module.ts`, `auth.controller.ts`, `auth.service.ts` — module wiring + HTTP surface.
- `roles.enum.ts` — `UserRole` enum (SUPER_ADMIN, ADMIN, FACULTY, etc.) consumed by `@Roles()` in `src/security/`.
- `dto/` — login/refresh request + response DTOs.
- `strategies/`
  - `login-strategy.interface.ts` — defines `LoginStrategy` + `LoginStrategyResult` + `LOGIN_STRATEGIES` DI symbol.
  - `local-login.strategy.ts` — priority `10`, bcrypt password check.
  - `moodle-login.strategy.ts` — priority `100`, Moodle token auth + user hydration on first login.
  - `index.ts` — exports + registration helpers.

## Key patterns

- **Strategy interface**: `priority: number`, `CanHandle(localUser, body): boolean`, `Execute(em, localUser, body): Promise<LoginStrategyResult>`.
- **Priority ranges**:
  - `0–99` — core auth (local passwords).
  - `100–199` — external providers (Moodle, LDAP, OAuth).
  - `200+` — fallbacks.
- **DI**: all strategies are registered under the `LOGIN_STRATEGIES` injection token as an array. `AuthService` sorts by `priority` and asks each `CanHandle()` in order until one matches.
- **Transactional execution**: `Execute()` receives an `EntityManager` — strategies must do all reads/writes through it, never spawn their own context.
- **Moodle hydration**: `MoodleLoginStrategy` creates/updates the local `User` from Moodle site-info on first login. Treat the local user as a cached projection, not the source of truth.

## Gotchas

- Strategies are tried in priority order and the **first `CanHandle` match wins** — once you add a new strategy, verify it can't shadow an existing one.
- Don't throw generic errors from `Execute()`; use `UnauthorizedException` so the controller maps it correctly.
- `moodleToken` on `LoginStrategyResult` is only set by `MoodleLoginStrategy` — consuming code should treat it as optional.

## Pointers

- `docs/workflows/auth-hydration.md` — Moodle hydration flow and user-record reconciliation.
- `src/security/CLAUDE.md` — guards, decorators, and Passport strategies that consume the tokens issued here.
