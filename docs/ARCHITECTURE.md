# Architecture

This project keeps authorization and execution concerns deliberately separate.

- **Nhost Auth** authenticates the human user and supplies `X-Hasura-User-Id`.
- **PostgreSQL + Hasura** enforce organization-scoped row access using `org_members`.
- **Hasura Actions** enforce runtime business rules that cannot safely be expressed as row permissions alone.
- **Nhost Functions** implement workflow saving, run creation, approval/resume, webhook intake, scheduled dispatch, event dispatch, and notification delivery.
- **Hasura Event Triggers** turn a queued `workflow_run` into asynchronous execution and dispatch notification outbox rows.
- **GraphQL subscriptions** stream `step_runs` to the Next.js frontend.
- **Gemini** powers `llm_call` steps through a server-side API key.

The execution engine snapshots the workflow step definition into each `step_run` before execution. A later edit to the workflow therefore cannot mutate the meaning of an already-started run.

Quota is reserved atomically before a run row is created. A PostgreSQL trigger settles the reservation exactly once when the run reaches a terminal state, preventing retries from double-counting usage.
