---
title: 'Manual smoke-test plan (Task 31)'
spec: 'tech-spec-sentiment-worker-vllm-primary-openai-fallback.md'
created: '2026-04-18'
---

# Manual smoke-test plan — sentiment vLLM-primary rollout

Execute this checklist end-to-end in `dev` (and again in `staging`) before the
PR moves to `In Develop`. Each step produces an observable artifact — DB row,
worker log line, or toast — listed under `Observation`.

## Pre-conditions

- `api.faculytics` running at dev port with migrations + seeders applied.
- `sentiment.worker.temp.faculytics` built with the new `VllmSentimentStrategy`.
- `admin.faculytics` dev server running; logged in as a `SUPER_ADMIN`.
- vLLM endpoint reachable at the current Thunder Compute URL (obtain from ops).
- At least one ready-to-run pipeline with ≥5 submissions.

## Steps

### 1. Seed row present

- Run `npx mikro-orm seeder:run --class=SystemConfigSeeder`.
- **Observation**: a SELECT against `system_config` returns a row with
  `key = 'SENTIMENT_VLLM_CONFIG'` and `value = '{"url":"","model":"","enabled":false}'`.

### 2. Admin UI card renders

- Navigate to `/settings`.
- **Observation**: the "Sentiment vLLM Configuration" card renders below the
  "Environments" card. Status reads **Disabled (OpenAI-only)** and URL / Model
  show "(not set)".

### 3. Happy-path rotate and enable

- Click Edit. Paste the current vLLM URL (e.g.
  `https://nmn5qf9j-8000.thundercompute.net`). Set model
  `unsloth/gemma-4-26B-A4B-it`. Flip the enable switch on. Save.
- **Observation**:
  - Sonner success toast: "vLLM configuration updated".
  - Card re-fetches and shows the new values with green "Enabled" status.
  - `audit_log` contains a new row with
    `action = 'admin.sentiment-vllm-config.update'` and `metadata.previous`
    / `metadata.next` populated.

### 4. Run a small pipeline and confirm `servedBy: 'vllm'`

- Trigger a pipeline with ~5 submissions that already have `cleanedComment`.
- **Observation**:
  - Worker logs: `vLLM call` entries (no `Rate limited` / `retrying`).
  - `sentiment_result` rows for this pipeline have
    `raw_result->>'servedBy' = 'vllm'`.
  - `positive_score` / `neutral_score` / `negative_score` form a valid
    one-hot triple (one equals `1`, the other two equal `0`).

### 5. Stale-URL circuit-breaker path

- Edit the card, paste `https://invalid.example`. Save.
- Trigger another pipeline with ~50 submissions.
- **Observation** (within ~60s — circuit breaker bound):
  - Worker logs: `vLLM circuit breaker tripped after N consecutive failures,
routing M remaining items to OpenAI fallback`.
  - All `sentiment_result` rows for this pipeline have
    `raw_result->>'servedBy' = 'openai'`.
  - No job is stuck in BullMQ `failed` state (confirms `<90s` envelope).

### 6. Disable and fall through to OpenAI-only

- Edit the card, flip the enable switch off. Save.
- Trigger a pipeline.
- **Observation**:
  - Worker logs: no `vLLM call` entries at all.
  - `sentiment_result` rows have `raw_result->>'servedBy' = 'openai'`.

### 7. Cross-field validation (F17)

- Edit the card. Clear the URL field. Leave the switch on. Save.
- **Observation**: sonner error toast; dialog does NOT close; user's edits
  preserved. API responds `400` with
  `Cannot enable vLLM with empty URL`.

### 8. Production gate (F16)

- In a `staging` or prod-like environment (where `NODE_ENV = 'production'` and
  `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD` is unset), attempt to save the card
  with enabled=true.
- **Observation**: sonner error toast; API responds `400` with
  `Enabling vLLM in production requires ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true`.

### 9. Long-input token-warn guardrail

- Seed a submission with a ~1500-character `cleanedComment` (e.g., paste a
  long code-switched paragraph).
- Trigger a pipeline that includes it with vLLM enabled.
- **Observation**: worker logs a WARN line:
  `Item <submissionId> estimated at N prompt tokens, approaching vLLM
max_model_len cap (1024)`. Pipeline still completes normally.

### 10. 401 silent-refresh (F23)

- In the admin SPA, artificially let the access token expire (or manually
  clear `accessToken` from local storage while keeping the refresh token).
- Re-open the sentiment-config card and Save a trivial change.
- **Observation**: the Save succeeds silently (one refresh, one retry) and
  the sonner success toast appears. DevTools Network panel shows a single 401
  followed by a 200 on retry.

## Rollback

- If any step fails, toggle `enabled=false` in the admin card → confirm the
  next pipeline logs no `vLLM call` entries → reopen the PR or revert the
  commit that introduced the failure.

## Sign-off

- Developer: ********\_\_******** Date: ****\_\_****
- Ops / reviewer: ********\_\_******** Date: ****\_\_****
