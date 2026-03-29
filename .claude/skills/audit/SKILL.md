---
name: audit
description: >
  Run a comprehensive code quality audit and automatically create GitHub issues for every finding.
  Produces one .md file per issue, creates the GitHub issues with labels, adds them to the project
  board, then writes an audit-summary.md. Trigger when user asks for a code audit, quality review,
  tech debt scan, security review, or anti-pattern analysis. Accepts an optional path argument to
  scope the audit (e.g. /audit src/modules/auth). Without args, audits the full src/ directory.
allowed-tools: Read, Grep, Glob, Bash, Write, Agent
---

# Code Quality Audit

> **Recommended settings:** Use **Opus** model with **extended thinking** enabled.
> Audits require multi-file reasoning and catching subtle patterns — Sonnet will miss more.
> For scoped single-module runs (`/audit src/modules/auth`), Sonnet is acceptable.

You are a senior software engineer performing a comprehensive code quality audit.
Your job is to find real technical debt, risk, and maintainability problems — then
file them as GitHub issues in one automated pass.

## Scope

The path to audit is: `$ARGUMENTS` (defaults to `src/` if not provided)

---

## PHASE 1 — Setup

1. Read `CLAUDE.md` (root and any subproject CLAUDE.md) for codebase context, intentional patterns, and known trade-offs. Do NOT flag patterns documented as intentional.

2. Ensure the required labels exist in the repo. Run:

   ```bash
   gh label list --repo CtrlAltElite-Devs/api.faculytics --json name --jq '.[].name'
   ```

   For each of the following that is missing, create it:

   ```bash
   gh label create "tech-debt"   --color "e4c217" --repo CtrlAltElite-Devs/api.faculytics
   gh label create "performance" --color "e08b17" --repo CtrlAltElite-Devs/api.faculytics
   gh label create "security"    --color "b60205" --repo CtrlAltElite-Devs/api.faculytics
   gh label create "refactor"    --color "0075ca" --repo CtrlAltElite-Devs/api.faculytics
   ```

3. Create the `audit/` working directory if it doesn't exist.

---

## PHASE 2 — Audit

Use an `Explore` subagent (or explore directly) to examine the scoped code for the four categories below. Pass the full CLAUDE.md context to the agent so it can avoid flagging intentional patterns.

### 1. Code Smells

- Duplicated / copy-pasted logic (DRY violations)
- Long methods or functions (doing too much)
- Large classes / god objects
- Deep nesting (arrow code)
- Magic numbers and magic strings
- Dead code (unreachable, unused exports, stale flags)
- Feature envy (a module heavily using another module's internals)
- Inappropriate intimacy between modules
- Inconsistent abstraction levels within the same file or function
- Missing or misleading comments that contradict the code

### 2. Anti-Patterns

- God objects / god modules
- Premature optimization
- Cargo cult code (code with no clear purpose)
- Spaghetti control flow
- Overuse of inheritance where composition fits better
- Shotgun surgery risk (one change requires edits across many unrelated files)
- Divergent change risk (one class changed for many different reasons)
- Primitive obsession (using raw primitives instead of domain types)
- Anemic domain model (objects with no behavior, just getters/setters)
- Speculative generality (over-engineering for hypothetical future needs)

### 3. Performance Issues

- N+1 query patterns
- Missing indexes on frequent query paths (flag the query, not the schema)
- Unbounded loops over large datasets
- Synchronous blocking operations that should be async
- Missing pagination on list endpoints
- Unnecessary data fetching (over-fetching, missing field selection)
- Cache invalidation problems or missing caching on hot paths
- Memory leaks (event listeners not cleaned up, closures holding references)

### 4. Security Issues

- Unsanitized user input used in queries, commands, or file paths
- Hardcoded secrets, credentials, or API keys
- Overly permissive CORS or access control configurations
- Missing authentication/authorization checks on sensitive endpoints
- Insecure direct object references (IDOR)
- Sensitive data logged to stdout/files
- Missing rate limiting on public-facing endpoints

---

## PHASE 3 — Write Issue Files

For each finding, write a file to `audit/issue-NNN-short-slug.md` (zero-padded, e.g. `issue-001-...`).

Each file must follow this exact template:

````md
---
title: '<concise, specific issue title — not generic>'
severity: Critical | Major | Minor
category: Code Smell | Anti-Pattern | Performance | Security
labels: [<gh labels>]
---

## Summary

One or two sentences describing the problem and why it matters.

## Location

- **File(s):** `path/to/file.ts` (lines X–Y if applicable)
- **Function/Class:** `functionName` / `ClassName`

## Problem

Explain the specific issue in detail. Include the problematic code snippet.

```language
// relevant code here
```
````

## Impact

- What breaks or degrades if left unaddressed?
- Who is affected (users, developers, infrastructure)?
- Is this a latent bug, performance risk, security exposure, or maintainability burden?

## Suggested Fix

Describe the recommended approach. Include a corrected code snippet if possible.

```language
// suggested fix here
```

## Acceptance Criteria

- [ ] Specific, testable condition 1
- [ ] Specific, testable condition 2
- [ ] Existing tests still pass / new tests added for the fix

````

**Label mapping** (use in frontmatter `labels` field):

| Category | Labels |
|----------|--------|
| Security | `security`, `bug` |
| Performance | `performance`, `enhancement` |
| Code Smell | `tech-debt`, `refactor` |
| Anti-Pattern | `tech-debt`, `refactor` |

---

## PHASE 4 — Create GitHub Issues

For each `.md` file written to `audit/`, create a GitHub issue:

```bash
ISSUE_URL=$(gh issue create \
  --repo CtrlAltElite-Devs/api.faculytics \
  --title "<title from frontmatter>" \
  --body "$(cat audit/issue-NNN-short-slug.md)" \
  --label "<comma-separated labels from frontmatter>")
````

Capture the returned issue URL. Then add the issue to the project board under Backlog:

```bash
gh project item-add 1 \
  --owner CtrlAltElite-Devs \
  --url "$ISSUE_URL"
```

> **Note:** `1` is the project **number** (not the GraphQL node ID). The project number
> is visible in the project URL or via `gh project list --owner CtrlAltElite-Devs`.

---

## PHASE 5 — Summary

Write `audit/audit-summary.md`:

```md
# Audit Summary

Scope: `<path audited>`
Date: <today's date>

| #   | Title | Severity | Category | File    | Issue        |
| --- | ----- | -------- | -------- | ------- | ------------ |
| 001 | ...   | Critical | Security | src/... | <GitHub URL> |
```

Then print the summary table to the conversation so the user sees results at a glance.

---

## SEVERITY GUIDE

| Severity     | Meaning                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Critical** | Exploitable security vulnerability, data loss risk, or production-breaking bug. Fix before next release. |
| **Major**    | Significant tech debt degrading performance, correctness, or developer velocity. Next sprint.            |
| **Minor**    | Low-risk code smell reducing readability or long-term maintainability. Backlog candidate.                |

---

## RULES

- Do NOT flag style preferences (formatting, naming) unless they introduce real ambiguity or risk.
- Do NOT create duplicate issues for the same root cause — one issue, all locations listed.
- Do NOT flag third-party library internals, only the calling code.
- Every issue must reference real file paths and real code from this codebase.
- If no issues are found in a category, skip it silently.
