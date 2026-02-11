---
name: test-generator
description: Scaffolds unit tests (.spec.ts) for NestJS Services and Controllers, including automatic mocking of dependencies like UnitOfWork and Repositories.
---

# Test Generator

This skill automates the creation of unit tests for NestJS components, ensuring a consistent testing pattern across the project.

## Workflow

1.  **Identify the target file**: Provide the path to the Service or Controller you want to test (e.g., `src/modules/auth/auth.service.ts`).
2.  **Execute the generator script**: Use the bundled script to create the `.spec.ts` file.
3.  **Refine the test**: The generated test will include a basic setup and "should be defined" test. You will need to add specific business logic tests.
4.  **Run the test**: Use `npm run test` or `npx jest path/to/file.spec.ts`.

## Usage

Run the following command from the project root:

```bash
node .gemini/skills/test-generator/scripts/generate_test.cjs <file-path>
```

### Example

To create tests for `AuthService`:

```bash
node .gemini/skills/test-generator/scripts/generate_test.cjs src/modules/auth/auth.service.ts
```

This will:

- Create `src/modules/auth/auth.service.spec.ts`.
- Analyze the constructor of `AuthService` to identify dependencies.
- Create mock providers for each dependency (e.g., `UnitOfWork`, `MoodleService`).
- Scaffold a `describe` block with a `beforeEach` that sets up the `Test.createTestingModule`.

## Standards Applied

- **File Naming**: `<original-name>.spec.ts`.
- **Framework**: Jest with `@nestjs/testing`.
- **Mocks**: Uses `jest.fn()` or specialized mock objects for complex dependencies like `UnitOfWork`.
