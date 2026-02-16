# Roadmap: api.faculytics

This document outlines the development progress, architectural milestones, and future goals for the `api.faculytics` platform. It serves as a high-level guide for system evolution and a context provider for developers and agents.

## Project Vision

To provide a robust, analytics-driven bridge between Moodle learning environments and institutional assessment frameworks, enabling data-informed decisions through synchronized data and structured feedback loops.

---

## Phase 1: Foundation & Core Synchronization (Current Focus)

Establishing the bedrock of the system: identity, hierarchy, and reliable data flow from Moodle.

- [x] **Identity Management:** Moodle-integrated JWT authentication and automatic user profile hydration.
- [x] **Institutional Hierarchy:** Rebuilding Campus/Semester/Department/Program structures from Moodle categories.
- [x] **Idempotent Infrastructure:** Automated migrations and self-healing infrastructure seeders (e.g., Dimension registry).
- [x] **Robust Startup:** Fail-fast initialization sequence ensuring DB integrity before service starts.
- [~] **Data Sync Engine:** Background jobs for Moodle category and course mirroring (Refinement in progress).
- [ ] **Enrollment Mirroring:** Efficient synchronization of user-course relationships with role mapping.

## Phase 2: Questionnaire & Assessment Engine

Enabling structured feedback through a flexible, weighted questionnaire system.

- [x] **Recursive Schema Validation:** Ensuring mathematical integrity (leaf-weight rules) in complex questionnaires.
- [x] **Dimension Registry:** A categorized framework for grouping assessment criteria across different questionnaire types.
- [x] **Institutional Snapshotting:** Decoupling historical submissions from future hierarchy changes.
- [~] **Submission & Scoring:** API for processing student/faculty feedback with normalized scoring (In development).
- [ ] **Scoring Breakdowns:** Providing granular results per Dimension in API responses and reports.
- [ ] **Peer/Self-Evaluation:** Support for multi-directional feedback workflows.

## Phase 3: Analytics, Reporting & Ecosystem

Turning synchronized data into actionable institutional insights.

- **Analytics Dashboard:** Visualizing performance trends across semesters and departments.
- **Reporting Engine:** Generating PDF/Excel exports for institutional reviews.
- **Notification System:** Automated reminders for pending evaluations via email/Moodle.
- **Role-Based Access Control (RBAC):** Granular permissions for institutional administrators and department heads.
- **External SIS Integration:** Optional hooks for data sources beyond Moodle.

---

## Immediate Next Steps (To-Do)

1. **[Safety]** Add integration tests for `DatabaseSeeder` to verify idempotency and error handling.
2. **[Infrastructure]** Expand `InfrastructureSeeder` to include default `Roles` and `SystemConfig`.
3. **[Feature]** Finalize the `QuestionnaireSubmission` API, ensuring all institutional snapshots are correctly captured.
4. **[Optimization]** Refactor `MoodleEnrollmentSyncService` for better performance with large-scale course data.
5. **[DX]** Continue refining documentation and agent skills to maintain high development velocity.
