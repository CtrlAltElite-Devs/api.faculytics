---
name: update-docs
description: Update project documentation in docs/ to reflect recent code changes, new features, or architectural decisions.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent
---

# Update Documentation

Review the recent code changes on the current branch and update the project documentation accordingly.

## Documentation Structure

The docs live in `docs/` with this layout:

- `docs/architecture/` — System design, module architecture, component descriptions
- `docs/decisions/` — Architectural decision records (numbered sequentially)
- `docs/workflows/` — Step-by-step flows (auth, sync, submission, etc.)
- `docs/ROADMAP.md` — High-level project roadmap

## Process

1. **Identify what changed**: Run `git diff master...HEAD --name-only` to see all changed files on this branch. Read the relevant source files to understand the changes.

2. **Determine which docs need updating**:
   - New module or major component? → Add a new file in `docs/architecture/`
   - New architectural pattern or trade-off? → Append a numbered entry to `docs/decisions/decisions.md`
   - New user-facing flow or integration? → Add a new file in `docs/workflows/`
   - Changed existing behavior? → Update the relevant existing doc

3. **Read existing docs first**: Always read the doc file before editing to understand its style, structure, and what's already covered. Match the existing tone and formatting.

4. **Update systematically**:
   - `docs/architecture/core-components.md` — Update if tech stack, modules, cron jobs, or infrastructure changed
   - `docs/decisions/decisions.md` — Add new decision records with clear rationale and trade-offs
   - Create new docs only when the change introduces a distinct architectural concern
   - Cross-reference between docs using relative links (e.g., `[Caching](../architecture/caching.md)`)

5. **Keep it concise**: Documentation should help developers understand _why_ and _how_, not restate the code. Use tables for structured data, code blocks for examples, and mermaid diagrams where they add clarity.

## If `$ARGUMENTS` is provided

Focus the documentation update on the topic specified: `$ARGUMENTS`
