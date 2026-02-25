---
title: 'Moodle Auth Connectivity Error Handling'
slug: 'moodle-auth-connectivity-error-handling'
created: '2026-02-25T14:30:00Z'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['NestJS', 'TypeScript', 'Fetch API', 'AuthService', 'MoodleClient']
files_to_modify:
  [
    'src/modules/auth/auth.service.ts',
    'src/modules/moodle/lib/moodle.client.ts',
    'src/modules/moodle/services/moodle-sync.service.ts',
    'src/modules/moodle/services/moodle-user-hydration.service.ts',
  ]
code_patterns:
  [
    'Standard NestJS Exceptions',
    'Custom Error Mapping',
    'Moodle API Integration',
    'UnitOfWork Transactions',
  ]
test_patterns:
  ['Unit Tests with Jest', 'Mocking MoodleService', 'Exception Verification']
---

# Tech-Spec: Moodle Auth Connectivity Error Handling

**Created:** 2026-02-25T14:30:00Z

## Overview

### Problem Statement

When the Moodle service is down or unreachable during login or synchronization, the backend currently returns a generic 500 Internal Server Error (caused by unhandled `fetch` exceptions). This makes it difficult for frontend developers to provide specific feedback to users and complicates server-side debugging.

### Solution

Catch `fetch` connectivity errors in `MoodleClient` and `AuthService`. Map these to a 4xx error (specifically `UnauthorizedException` or `BadRequestException` as per frontend preference) with a descriptive message and internal error code. Improve error handling in the user synchronization and hydration flows to ensure failures are logged with enough context for debugging.

### Scope

**In Scope:**

- Catching `fetch` network errors (e.g., `ECONNREFUSED`, timeouts) in `MoodleClient.login` and `MoodleClient.call`.
- Mapping connection failures in `AuthService.Login` to `UnauthorizedException` (401) with a "Moodle service unreachable" message.
- Enhancing error reporting in `MoodleSyncService.SyncUserContext` and `MoodleUserHydrationService.hydrateUserCourses` (logging specific Moodle errors).
- Unit tests to verify that connectivity failures result in the expected 4xx response.

**Out of Scope:**

- Automatic retry mechanisms for failed requests.
- Implementing a global error filter for all Moodle-related services.
- Changes to the frontend application.

## Context for Development

### Codebase Patterns

- **NestJS Exceptions:** Use `UnauthorizedException` for 401 and `BadRequestException` for 400.
- **Moodle Integration:** `MoodleClient` is the low-level wrapper around the Moodle REST API.
- **Transactions:** `AuthService.Login` uses `UnitOfWork` for database consistency.
- **Logging:** Use `Logger` from `@nestjs/common` for service-level logs.

### Files to Reference

| File                                                           | Purpose                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/modules/auth/auth.service.ts`                             | Orchestrates the login process and initial synchronization. |
| `src/modules/moodle/lib/moodle.client.ts`                      | Handles direct HTTP communication with Moodle.              |
| `src/modules/moodle/services/moodle-sync.service.ts`           | Synchronizes user data from Moodle to the local database.   |
| `src/modules/moodle/services/moodle-user-hydration.service.ts` | Hydrates user course enrollments post-login.                |
| `src/modules/auth/auth.service.spec.ts`                        | Existing tests for `AuthService`.                           |

### Technical Decisions

- **Error Code:** Preference for `401 Unauthorized` with a specific payload indicating service unavailability.
- **Debugging:** Log original error details (message, code) before re-throwing or wrapping.
- **Client Resilience:** Add a timeout to `fetch` calls in `MoodleClient` to prevent hanging requests.

## Implementation Plan

- [x] **Task 1: Add request timeout and connectivity error handling to `MoodleClient`**
  - **File:** `src/modules/moodle/lib/moodle.client.ts`
  - **Action:**
    - Update `login` and `call` methods to use `AbortSignal.timeout(10000)` (10 seconds) in the `fetch` options.
    - Wrap `fetch` calls in a `try-catch` block.
    - If an error is caught, check if it's a timeout (`name === 'TimeoutError'`) or a network error (e.g., `fetch failed`).
    - Rethrow a custom error or a descriptive `Error` that can be identified by the caller.
  - **Notes:** Use `AbortSignal.timeout` available in Node 20+.

- [x] **Task 2: Update `AuthService.Login` to handle Moodle connectivity issues**
  - **File:** `src/modules/auth/auth.service.ts`
  - **Action:**
    - Wrap the section where Moodle is called (`moodleService.Login`, `moodleSyncService.SyncUserContext`, and `moodleUserHydrationService.hydrateUserCourses`) in a `try-catch`.
    - Catch connectivity/timeout errors from Moodle.
    - Throw `UnauthorizedException` with message: `"Moodle service is currently unreachable. Please try again later."`
  - **Notes:** Ensure logs are created before throwing the exception to capture the root cause.

- [x] **Task 3: Enhance logging in `MoodleSyncService` and `MoodleUserHydrationService`**
  - **Files:** `src/modules/moodle/services/moodle-sync.service.ts`, `src/modules/moodle/services/moodle-user-hydration.service.ts`
  - **Action:**
    - In `MoodleSyncService.SyncUserContext`, add error logging if `moodleService.GetSiteInfo` fails.
    - In `MoodleUserHydrationService.hydrateUserCourses`, ensure that connectivity errors in `GetEnrolledCourses` are logged properly.

- [x] **Task 4: Verify error handling with Unit Tests**
  - **File:** `src/modules/auth/auth.service.spec.ts` (or new test file)
  - **Action:**
    - Add a test case that mocks `MoodleService.Login` to throw a network error.
    - Assert that `AuthService.Login` throws `UnauthorizedException` with the correct message.
    - Add a test case for timeout simulation.

## Acceptance Criteria

- [x] **AC 1: Connection Refused Handling**
  - **Given** the Moodle server is down (ECONNREFUSED).
  - **When** a user attempts to login.
  - **Then** the API returns a 401 Unauthorized response with message "Moodle service is currently unreachable. Please try again later."

- [x] **AC 2: Request Timeout Handling**
  - **Given** the Moodle server is extremely slow.
  - **When** a request to Moodle exceeds 10 seconds.
  - **Then** the request is aborted and the API returns a 401 Unauthorized response.

- [x] **AC 3: Graceful Hydration Failure**
  - **Given** Moodle server becomes unreachable _after_ successful login but _during_ hydration.
  - **When** the hydration process fails due to connectivity.
  - **Then** the failure is logged as an error with context, and the login process returns a 401 (since initial hydration is critical for the first login).

- [x] **AC 4: Detailed Server Logs**
  - **Given** a network failure during Moodle communication.
  - **When** the error is caught by the backend.
  - **Then** the original error message and stack trace are logged to the console/log files for debugging.

## Additional Context

### Dependencies

- None. Relies on native `fetch` and NestJS `UnauthorizedException`.

### Testing Strategy

- **Unit Tests:** Mock `MoodleService` and `MoodleClient` behaviors.
- **Integration Tests:** Use a dummy URL for `MOODLE_BASE_URL` in a test environment.

### Notes

- **Future Consideration:** Implementing a circuit breaker might be useful if Moodle downtime is frequent.
- **Frontend Sync:** Ensure the frontend is updated to handle the 401 message specifically if needed.

## Review Notes

- Adversarial review completed
- Findings: 10 total, 3 fixed, 7 skipped (noise/design decisions)
- Resolution approach: auto-fix
- Fixed: F1 (Object.setPrototypeOf for custom error), F5 (duplicate test assertions), F8 (trailing whitespace)
- F4 determined to be non-issue upon analysis (errors propagate correctly through MoodleService)
