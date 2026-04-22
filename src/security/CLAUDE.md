# Security

Authentication + authorization primitives: JWT guards, role checks, throttling, and Passport strategies.

## File map

- `decorators/`
  - `roles.decorator.ts` — `@Roles(...roles)` attaches metadata consumed by `RolesGuard`.
  - `index.ts` — also exports `@UseJwtGuard()` (the one-decorator-to-rule-them-all for protected endpoints).
  - `use-jwt-guard.decorator.spec.ts` — verifies composition.
- `guards/`
  - `jwt-auth.guard.ts` — validates access tokens via the `jwt` Passport strategy.
  - `refresh-jwt-auth.guard.ts` — validates refresh tokens via the `refresh-jwt` strategy.
  - `roles.guard.ts` — reads `@Roles(...)` metadata and checks the authenticated user's role(s).
  - `throttle.guard.ts` — custom throttling (wraps `@nestjs/throttler`).
- `passport-strategys/` *(note the spelling)*
  - `jwt.strategy.ts` — access-token strategy.
  - `refresh-jwt.strategy.ts` — refresh-token strategy.

## Conventions

- **Protect endpoints with `@UseJwtGuard()`** from `decorators/`. It composes the JWT guard; don't sprinkle raw `@UseGuards(JwtAuthGuard)` everywhere.
- **Role-gated endpoints**: stack `@UseJwtGuard()` + `@Roles(UserRole.SUPER_ADMIN, ...)`. `RolesGuard` runs AFTER auth — ordering matters.
- **Refresh endpoint**: use `RefreshJwtAuthGuard` directly (the refresh flow is distinct enough that it doesn't reuse `@UseJwtGuard()`).
- Role values live in `src/modules/auth/roles.enum.ts`.

## Gotchas

- **Folder is `passport-strategys` (not `strategies`)** — historical typo that's now load-bearing; imports and spec files reference it as-is. Don't silently rename.
- `RolesGuard` needs `@Roles(...)` metadata; without it the guard short-circuits to allow — i.e. forgetting `@Roles` on a "SUPER_ADMIN only" endpoint silently opens it to every authenticated user.
- The `ThrottleGuard` has its own config; don't assume `@Throttle()` from `@nestjs/throttler` alone covers it.

## Pointers

- `src/modules/auth/CLAUDE.md` — how login issues the tokens these guards validate.
- Root `CLAUDE.md` — JWT env vars (`JWT_SECRET`, `REFRESH_SECRET`, `JWT_ACCESS_TOKEN_EXPIRY`, etc.).
