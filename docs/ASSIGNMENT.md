# Assignment Coverage Matrix

| Requirement | Implementation |
|---|---|
| organizations + quota | `organizations`, atomic `quota_remaining`, terminal settlement trigger, monthly reset dispatcher |
| org_members roles | `org_members.role` = owner/editor/viewer, unique `(org_id,user_id)` |
| workflows / steps / triggers | relational ownership + JSONB step/trigger config |
| workflow_runs paused | statuses include `paused`; durable `next_step_order` cursor |
| step_runs details | status/input/output/error/attempt/approval fields + immutable step snapshot |
| llm_call | Gemini Generate Content, server-only key, JSON response option, retry |
| http_request | real external fetch, retry, timeout, SSRF/network guards |
| db_write | writes to `workflow_results`; owner-only definition |
| notify Event Trigger | notification outbox INSERT → Hasura Event Trigger → handler |
| conditional_branch | forward branch targets and skipped step states |
| approval_gate | pauses run; `approveStep` verifies org role in Action handler and resumes |
| manual trigger | `triggerWorkflowRun` Hasura Action |
| webhook trigger | public Hasura `webhookTrigger` Action + hashed secret |
| scheduled trigger | Hasura cron → scheduled dispatcher → run enqueue |
| database event | `trigger_events` INSERT Event Trigger → matching db_event workflow |
| relationships | Hasura metadata + composite organization foreign keys |
| aggregation | tracked `org_monthly_usage` view |
| Layer 1 | Hasura membership-scoped permissions using `X-Hasura-User-Id` |
| Layer 2 | `saveWorkflow` restricted-node logic + `approveStep` runtime approver check |
| org workflow query | `ORG_WORKSPACE` returns steps/triggers/latest run |
| create/edit mutation | `saveWorkflow` Action |
| approval mutation | `approveStep` Action |
| subscription | `STEP_RUNS_SUBSCRIPTION` filtered by `workflow_run_id` |
| live UI | `RunViewer` subscription, paused state and approve control |
| usage indicator | sidebar quota progress + reserved/available counts |
| cross-org proof | `scripts/security-smoke.mjs` + known-ID tests in `docs/DEMO.md` |
