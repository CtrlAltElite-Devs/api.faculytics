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

    Note over MoodleUserHydrationService: Sync Courses & Enrollments
    MoodleUserHydrationService->>MoodleService: GetEnrolledCourses(token, userId)
    MoodleUserHydrationService->>MoodleService: GetCourseUserProfiles (Parallel roles)

    Note over MoodleUserHydrationService: Resolve Institutional Authorities (Deans)
    MoodleUserHydrationService->>MoodleService: GetUsersWithCapability(withcapability=moodle/category:manage)

    MoodleUserHydrationService-->>MoodleLoginStrategy: Complete
    MoodleLoginStrategy-->>AuthService: LoginStrategyResult (user + moodleToken)
    AuthService-->>AuthController: JWT + RefreshToken
    AuthController-->>Client: 200 OK (Tokens)
```

## Institutional Authority Resolution (Dean Mapping)

The system automatically detects if a user has management authorities over specific categories (Campuses, Departments, or Programs).

1.  **Capability Check:** For each unique category a user is enrolled in, the system picks a representative course.
2.  **Moodle Verification:** It queries Moodle to see if the current user has the `moodle/category:manage` capability in that context.
3.  **Role Persistence:** If found, a `UserInstitutionalRole` (e.g., 'dean') is recorded for that specific category.
4.  **Global Role Propagation:** The user's global `roles` array is updated to include 'dean' if any institutional authority is detected.
