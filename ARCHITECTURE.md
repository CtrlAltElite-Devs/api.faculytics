# Architecture Analysis: api.faculytics

This document provides a detailed overview of the software architecture for the `api.faculytics` project, a NestJS-based backend designed for Moodle integration.

## 1. System Overview

`api.faculytics` serves as an intermediary layer between Moodle and local institutional data. Its primary responsibilities include:

- **Authentication:** Authenticating users via Moodle tokens and issuing local JWTs.
- **Data Synchronization:** Mirroring Moodle's institutional hierarchy (Campuses, Semesters, Departments, Programs) and course enrollments.
- **Entity Management:** Maintaining a normalized local database for analytics and extended features.

## 2. Technology Stack

- **Backend Framework:** [NestJS](https://nestjs.com/) (v10+)
- **Database ORM:** [MikroORM](https://mikro-orm.io/) with PostgreSQL
- **Authentication:** Passport.js (JWT and Refresh Token strategies)
- **External API:** Moodle Web Services (REST)
- **Task Scheduling:** NestJS Schedule (Cron)
- **Validation:** Zod (Environment variables), class-validator (DTOs)

## 3. Module Architecture

The application is structured into **Infrastructure** and **Application** layers, coordinated by the `AppModule`.

```mermaid
classDiagram
    class AppModule {
        +onApplicationBootstrap()
    }
    class InfrastructureModules {
        <<Namespace>>
        ConfigModule
        MikroOrmModule
        JwtModule
        PassportModule
        ScheduleModule
    }
    class ApplicationModules {
        <<Namespace>>
        AuthModule
        MoodleModule
        EnrollmentsModule
        HealthModule
        ChatKitModule
    }

    AppModule --> InfrastructureModules : "imports"
    AppModule --> ApplicationModules : "imports"

    AuthModule --> MoodleModule : "uses MoodleService"
    AuthModule --> CommonModule : "uses CustomJwtService"
    MoodleModule --> CommonModule : "uses UnitOfWork"
    EnrollmentsModule --> MoodleModule : "uses MoodleService"

    class MoodleModule {
        +MoodleService
        +MoodleSyncService
        +MoodleCategorySyncService
        +MoodleCourseSyncService
        +EnrollmentSyncService
    }

    class AuthModule {
        +AuthService
        +JwtStrategy
        +JwtRefreshStrategy
    }
```

## 4. Data Model (ERD)

The database schema reflects the institutional hierarchy derived from Moodle's category structure.

```mermaid
erDiagram
    USER ||--o{ MOODLE_TOKEN : "owns"
    USER ||--o{ REFRESH_TOKEN : "has"
    USER ||--o{ ENROLLMENT : "enrolled"

    CAMPUS ||--o{ SEMESTER : "contains"
    SEMESTER ||--o{ DEPARTMENT : "contains"
    DEPARTMENT ||--o{ PROGRAM : "contains"
    PROGRAM ||--o{ COURSE : "contains"

    COURSE ||--o{ ENROLLMENT : "has"

    USER {
        uuid id
        string userName
        int moodleUserId
        string firstName
        string lastName
    }

    MOODLE_TOKEN {
        uuid id
        string token
        uuid userId
    }

    CAMPUS {
        uuid id
        int moodleCategoryId
        string code
    }

    SEMESTER {
        uuid id
        int moodleCategoryId
        string code
        uuid campusId
    }

    DEPARTMENT {
        uuid id
        int moodleCategoryId
        string code
        uuid semesterId
    }

    PROGRAM {
        uuid id
        int moodleCategoryId
        string code
        uuid departmentId
    }

    COURSE {
        uuid id
        int moodleCourseId
        string shortname
        uuid programId
    }

    ENROLLMENT {
        uuid id
        uuid userId
        uuid courseId
        string role
    }
```

## 5. Core Workflows

### 5.1. Authentication & User Hydration

When a user logs in, the system synchronizes their Moodle profile information before issuing local tokens.

```mermaid
sequenceDiagram
    participant Client
    participant AuthController
    participant AuthService
    participant MoodleService
    participant MoodleUserHydrationService
    participant UserRepository

    Client->>AuthController: POST /auth/login (moodleToken)
    AuthController->>AuthService: LoginWithMoodle(moodleToken)
    AuthService->>MoodleService: GetSiteInfo(moodleToken)
    MoodleService-->>AuthService: SiteInfo (username, userid, etc.)
    AuthService->>MoodleUserHydrationService: HydrateUser(SiteInfo)
    MoodleUserHydrationService->>UserRepository: Upsert(SiteInfo)
    UserRepository-->>MoodleUserHydrationService: UserEntity
    MoodleUserHydrationService-->>AuthService: UserEntity
    AuthService-->>AuthController: JWT + RefreshToken
    AuthController-->>Client: 200 OK (Tokens)
```

### 5.2. Institutional Hierarchy Synchronization

The system uses a background job to rebuild the local institutional hierarchy based on Moodle Categories.

```mermaid
flowchart TD
    Start([Cron: CategorySyncJob]) --> Fetch[Fetch all Moodle Categories]
    Fetch --> Parse[Parse Category Path/Name]
    Parse --> BuildCampus[Sync Campus Entities]
    BuildCampus --> BuildSemester[Sync Semester Entities]
    BuildSemester --> BuildDept[Sync Department Entities]
    BuildDept --> BuildProg[Sync Program Entities]
    BuildProg --> HierarchyReady[Institutional Hierarchy Rebuilt]
    HierarchyReady --> End([Finish])
```

## 6. Architectural Decisions

- **External ID Stability:** Moodle's `moodleCategoryId` and `moodleCourseId` are used as business keys for idempotent upserts to ensure primary key stability in the local database.
- **Unit of Work Pattern:** Leveraging MikroORM's `EntityManager` to ensure transactional integrity during complex synchronization processes.
- **Base Job Pattern:** All background jobs extend `BaseJob` to provide consistent logging, startup execution logic, and error handling.
- **Idempotency:** Sync services are designed to be run repeatedly without creating duplicate records or overwriting local customizations (like UUIDs).
