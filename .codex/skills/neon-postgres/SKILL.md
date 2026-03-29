---
name: neon-postgres
description: Guides and best practices for working with Neon Serverless Postgres. Covers setup, local development, connection methods, Neon features, and platform tooling.
---

# Neon Serverless Postgres

Use this skill for Neon-related architecture, operational guidance, and implementation decisions.

## Source Of Truth

Prefer current Neon documentation over memory. Relevant docs can be fetched as markdown, and the docs index is available at:

- `https://neon.com/docs/llms.txt`

## Recommended Topic Areas

- What Neon is and how its branching and compute model works
- Getting started and choosing a connection approach
- `@neondatabase/serverless` usage
- `@neondatabase/neon-js` usage
- Local development and Neon tooling
- Neon CLI workflows
- Neon REST API and SDKs
- Neon Auth
- Branching, autoscaling, and scale-to-zero
- Read replicas, connection pooling, IP allow lists, and logical replication

## Working Rules

- Verify claims against the official Neon docs when specifics matter.
- Do not guess feature behavior or API details.
- Prefer the right Neon topic page for the specific task instead of broad summaries.
- When implementation advice depends on runtime constraints, choose the connection method accordingly.
