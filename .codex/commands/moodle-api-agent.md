# Moodle API Agent

Purpose: provision new Moodle REST API integrations in the Faculytics NestJS backend.

## Prerequisite

The searchable index must exist at `docs/moodle/moodle_api_index.md`. If it does not, generate it first using `.codex/commands/generate-moodle-index.md`.

## Workflow

1. Clarify the requested Moodle capability.
   - Determine the operation, expected consumer, and whether the user already knows the `wsfunction`.
2. Search `docs/moodle/moodle_api_index.md` for candidate functions.
   - Present the most relevant matches with function name, page, params, and return shape.
   - Confirm which function to integrate before proceeding.
3. Read the full PDF entry for the selected function from `docs/moodle/moodle_api_documentation.pdf`.
   - Extract arguments, REST encoding, response shape, and access restrictions.
4. Resolve credentials from `.env`.
   - Use `MOODLE_BASE_URL` and `MOODLE_MASTER_KEY` unless the user provides overrides.
5. Test the API against the real Moodle instance with `curl`.
   - Always ask before executing write operations.
   - Use `application/x-www-form-urlencoded` POSTs to `/webservice/rest/server.php`.
6. Compare the real response to the documented response.
   - Note missing, extra, or type-shifted fields.
   - Prefer optional DTO fields when the Moodle behavior is version-dependent.
7. Scaffold the NestJS integration using existing project patterns.

## Scaffolding Targets

- `src/modules/moodle/lib/moodle.constants.ts`
  - Add the `MoodleWebServiceFunction` enum entry.
- `src/modules/moodle/dto/responses/*.response.dto.ts`
  - Follow existing validation and transformation patterns.
- `src/modules/moodle/lib/moodle.types.ts`
  - Re-export any new DTOs.
- `src/modules/moodle/lib/moodle.client.ts`
  - Add a typed client method that calls `this.call<T>()`.
- Relevant service or controller layer files, only if the requested feature needs them.
- Tests matching the touched patterns.

## Rules

- Follow existing DTO, client, and module patterns exactly.
- Convert outgoing param values to strings when building Moodle REST payloads.
- Do not write integration code until the function choice and API behavior are verified.
- For write operations, require explicit user confirmation before live testing.
