# Authentication & User Hydration

When a user logs in, the `AuthService` resolves the appropriate login strategy based on priority ordering. Strategies are evaluated in order — the first one whose `CanHandle()` returns `true` is executed.

## Login Strategy Resolution

```mermaid
flowchart TD
    A[POST /auth/login] --> B[AuthService.Login]
    B --> C{Sort strategies by priority}
    C --> D[LocalLoginStrategy priority=10]
    C --> E[MoodleLoginStrategy priority=100]

    D --> F{User exists & has password?}
    F -- Yes --> G[bcrypt compare → return user]
    F -- No --> E

    E --> H{User has no password or not found?}
    H -- Yes --> I[Moodle token auth + user hydration]
    H -- No --> J[UnauthorizedException]

    I --> K{Moodle reachable?}
    K -- Yes --> L[Sync user, courses, authorities → return user + token]
    K -- No --> M[MoodleConnectivityError → 401]

    G --> N[Issue JWT + RefreshToken]
    L --> N
    N --> O[200 OK Tokens]
```

## Moodle Login Flow (Detail)

When the `MoodleLoginStrategy` handles the request, it performs full user hydration:

```mermaid
sequenceDiagram
    participant Client
    participant AuthController
    participant AuthService
    participant MoodleLoginStrategy
    participant MoodleService
    participant MoodleUserHydrationService
    participant UserRepository

    Client->>AuthController: POST /auth/login (username, password)
    AuthController->>AuthService: Login(body)
    AuthService->>MoodleLoginStrategy: Execute(em, localUser, body)
    MoodleLoginStrategy->>MoodleService: Login(username, password)
    MoodleService-->>MoodleLoginStrategy: moodleToken
    MoodleLoginStrategy->>MoodleService: GetSiteInfo(moodleToken)
    MoodleService-->>MoodleLoginStrategy: SiteInfo (username, userid, etc.)
    MoodleLoginStrategy->>MoodleUserHydrationService: SyncUserContext(SiteInfo)
    MoodleUserHydrationService->>UserRepository: Upsert(SiteInfo)
    MoodleLoginStrategy->>MoodleUserHydrationService: hydrateUserCourses(moodleUserId, moodleToken)

    Note over MoodleUserHydrationService: Sync Courses, Enrollments & Sections
    MoodleUserHydrationService->>MoodleService: GetEnrolledCourses(token, userId)
    MoodleUserHydrationService->>MoodleService: GetCourseUserProfiles (Parallel roles)
    MoodleUserHydrationService->>MoodleService: GetCourseGroups (Parallel per course)
    MoodleUserHydrationService->>MoodleService: GetCourseUserGroups (Parallel per course)

    Note over MoodleUserHydrationService: Upsert Sections + assign to Enrollments

    Note over MoodleUserHydrationService: Resolve Institutional Roles (Chairperson auto-detection)
    MoodleUserHydrationService->>MoodleService: GetUsersWithCapability(withcapability=moodle/category:manage)
    Note over MoodleUserHydrationService: Capability at program (depth 4) → CHAIRPERSON (source=auto)
    Note over MoodleUserHydrationService: Manual DEAN roles (source=manual) are preserved, not overwritten

    MoodleUserHydrationService-->>MoodleLoginStrategy: Complete
    MoodleLoginStrategy-->>AuthService: LoginStrategyResult (user + moodleToken)
    AuthService-->>AuthController: JWT + RefreshToken
    AuthController-->>Client: 200 OK (Tokens)
```

## Institutional Role Resolution

The system detects institutional management roles from Moodle category capabilities. Roles have a `source` field (`auto` or `manual`) that determines whether hydration can manage them.

### Auto-Detection (CHAIRPERSON)

1. For each enrolled course in a program category (depth 4), check `moodle/category:manage` capability.
2. If the user has the capability, assign `CHAIRPERSON` at that program (`source=auto`).
3. Auto-detected roles are re-evaluated on every login — stale ones are removed.
4. If a manual `DEAN` exists at the parent department, the auto CHAIRPERSON is skipped (DEAN subsumes it).

### Manual Assignment (DEAN)

DEAN roles are assigned by a `SUPER_ADMIN` via `POST /admin/institutional-roles`:

```json
{ "userId": "<uuid>", "role": "DEAN", "moodleCategoryId": 8 }
```

Manual roles (`source=manual`) are never modified by the hydration process. They persist across logins until explicitly removed via `DELETE /admin/institutional-roles`.

### Role Hierarchy

| Depth | Category Level | Role        | Source | Scope                      |
| ----- | -------------- | ----------- | ------ | -------------------------- |
| 3     | Department     | DEAN        | manual | All programs in department |
| 4     | Program        | CHAIRPERSON | auto   | Specific program only      |

### Global Role Propagation

After institutional role resolution, the user's `roles` array is derived from both enrollment roles (via `MoodleRoleMapping`) and institutional roles. A user can have multiple roles (e.g., `[FACULTY, DEAN]` or `[FACULTY, CHAIRPERSON]`).
