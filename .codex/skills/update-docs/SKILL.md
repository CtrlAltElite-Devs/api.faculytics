---
name: update-docs
description: Update project documentation in docs/ to reflect recent code changes, new features, or architectural decisions.
---

# Update Documentation

Review the recent code changes on the current branch and update the project documentation accordingly.

## Documentation Structure

The docs live in `docs/` with this layout:

- `docs/architecture/` - System design, module architecture, component descriptions
- `docs/decisions/` - Architectural decision records
- `docs/workflows/` - Step-by-step flows
- `docs/ROADMAP.md` - High-level project roadmap

## Process

1. Identify what changed.
   - Run `git diff master...HEAD --name-only` and read the relevant source files.
2. Determine which docs need updating.
   - New module or major component: add or update `docs/architecture/`
   - New architectural pattern or trade-off: update `docs/decisions/decisions.md`
   - New user-facing flow or integration: add or update `docs/workflows/`
   - Changed behavior: update the relevant existing doc
3. Read the target docs before editing.
   - Match their existing tone and structure.
4. Update systematically.
   - Prefer editing existing docs over creating redundant ones.
   - Cross-reference related docs with relative links.
5. Keep the docs concise.
   - Focus on why and how, not code restatement.

## Optional Focus

If a task provides a specific topic, narrow the documentation update to that topic.
