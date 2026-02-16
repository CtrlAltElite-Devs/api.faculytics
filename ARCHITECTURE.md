# Architecture Documentation: api.faculytics

This directory contains the architectural documentation for the `api.faculytics` project.

## Table of Contents

### [1. Core Components](./docs/architecture/core-components.md)

- System Overview
- Technology Stack
- Module Architecture (NestJS)

### [2. Data Model (ERD)](./docs/architecture/data-model.md)

- Entity Relationship Diagrams
- Institutional Hierarchy
- Questionnaire Schema

### [3. Workflows](./docs/workflows/)

- [Authentication & User Hydration](./docs/workflows/auth-hydration.md)
- [Institutional Hierarchy Sync](./docs/workflows/institutional-sync.md)
- [Questionnaire Submission & Scoring](./docs/workflows/questionnaire-submission.md)

### [4. Architectural Decisions](./docs/decisions/decisions.md)

- External ID Stability
- Unit of Work Pattern
- Questionnaire Leaf-Weight Rules
- Institutional Snapshotting
