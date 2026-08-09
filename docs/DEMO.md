# Final Task Recording Script

Target: a focused ~6 minute recording that proves the exact acceptance scenario with the hosted Vercel app and Frankfurt Nhost backend.

## Before recording

- Confirm the Vercel production deployment is **Ready** and hard-refresh once.
- Sign in as the Northstar AI owner and remove disposable failed test workflows with the owner-only **Delete** action. Keep the final reviewer workflow.
- Resolve any old paused test run if you want a completely clean quota card.
- `GEMINI_API_KEY` exists only in the backend environment.
- **Northstar AI (Org A):** owner + editor.
- **Orbit Labs (Org B):** owner + viewer.
- Have credentials for the Org A owner and Org B viewer.
- Keep the Org A workflow UUID available for the known-ID attack test.
- Never show passwords, access tokens, admin secrets, or webhook secrets in the recording.

## 0:00–0:45 — Product, organizations, and roles

Open the live Vercel URL and sign in as the Northstar AI owner. Show:

- organization selector → **Northstar AI · owner**;
- monthly quota and the tracked monthly-run aggregation;
- owner role badge;
- clean workflow sidebar.

State that owner/editor/viewer are per-organization memberships in `org_members`, not global JWT roles.

## 0:45–1:45 — Build the required workflow

Create a workflow and click **Load reviewer demo**. Briefly show the color-coded nodes:

1. `llm_call` — Gemini sentiment classification using `gemini-3.5-flash-lite`.
2. `conditional_branch` — `POSITIVE` goes to step 3; `NEGATIVE` goes directly to step 4.
3. `http_request` — external HTTP call on the positive branch.
4. `approval_gate` — human review before persistence.
5. `db_write` — owner-only persisted result.

Enable **Manual** and **Webhook** triggers and save. Point out that DB write and webhook configuration are owner-only. The server Action is the enforcement boundary; the UI restrictions are convenience only.

## 1:45–3:05 — Positive manual run, live subscription, pause, approval

Click **Run**. Do not refresh the page.

The Action returns a run ID immediately and the right-side panel subscribes to `step_runs`. Show the live transition:

```text
Gemini             completed → POSITIVE
Conditional branch completed → target step 3
HTTP request        completed
Approval gate       waiting_approval
DB write            pending
```

Show **Paused · awaiting approval**. Expand one step so the reviewer can see real input/output and `attempt_count`.

Click **Approve & resume**. The same run resumes, DB write completes, the pipeline reaches **Completed**, and the workspace quota/run summary refreshes.

## 3:05–3:55 — Negative webhook run proves a different branch

Trigger the same workflow through the public `webhookTrigger` Action using a negative payload. The webhook secret is required but must not be shown in the recording.

Example shape:

```bash
curl "$NHOST_GRAPHQL_URL" \
  -H 'content-type: application/json' \
  --data '{
    "query":"mutation($id:uuid!,$secret:String!,$payload:json){ webhookTrigger(workflow_id:$id,secret:$secret,payload:$payload){ run_id status } }",
    "variables":{"id":"ORG_A_WORKFLOW_ID","secret":"REDACTED","payload":{"text":"The launch was a disaster and customers are extremely disappointed."}}
  }'
```

Show the resulting run in the app or API output:

```text
trigger_type         webhook
Gemini               NEGATIVE
conditional branch   _branch_target = 4
HTTP request         skipped
approval gate        waiting_approval
```

This is the key proof that the conditional branch changes actual execution behavior based on LLM output.

## 3:55–5:10 — Viewer UI + known-ID cross-organization attack

Sign out and sign in as `viewer-b@example.com`.

First show the normal UI:

- only **Orbit Labs** is visible;
- Northstar workflows are absent;
- Run, Save, workflow creation, and restricted mutation controls are not available to the viewer.

Then use the Org B viewer JWT in a prepared terminal/API client while keeping the token hidden. Supply the exact known Org A IDs.

Known workflow read:

```graphql
query GuessOrgAWorkflow($id: uuid!) {
  workflows_by_pk(id: $id) { id name org_id }
}
```

Expected: `workflows_by_pk: null`.

Known workflow trigger:

```graphql
mutation GuessTrigger($id: uuid!) {
  triggerWorkflowRun(workflow_id: $id, input: { attack: "known-id" }) {
    run_id
    status
  }
}
```

Expected: `Not found or not authorized` and no run.

If an Org A approval step is paused, try:

```graphql
mutation GuessApproval($id: uuid!) {
  approveStep(step_run_id: $id) { run_id status }
}
```

Expected: `Not found or not authorized`. The repository's `npm run security:smoke` automates the same checks.

## 5:10–6:00 — Retry, aggregation, and source-of-truth proof

Return to the Org A owner. Show the monthly usage card and explain that it is backed by the tracked `org_monthly_usage` PostgreSQL view, which includes monthly run totals, success/failure counts, remaining/reserved quota, and average run duration.

Briefly show these repository locations:

- `functions/_lib/runner.ts` — LLM/HTTP retry handling and execution semantics;
- `nhost/migrations/default/.../up.sql` — schema, quota settlement, and `org_monthly_usage` view;
- `nhost/metadata/` — Hasura relationships, permissions, Actions, Event/Cron triggers;
- `scripts/security-smoke.mjs` — known-ID cross-org security checks.

If you want direct retry evidence, show a preserved development run or test output where an LLM/HTTP step reached `attempt_count: 2`; do not keep failed test workflows visible in the product sidebar solely for this purpose.

Close on the live Vercel URL and GitHub repository.
