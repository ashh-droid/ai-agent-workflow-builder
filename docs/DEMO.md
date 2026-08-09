# Final Task Recording Script

Target: a focused ~6 minute recording that proves the exact acceptance scenario.

## Before recording

- Hosted Nhost project and Next.js app are healthy.
- `GEMINI_API_KEY` exists only in the backend environment.
- **Northstar AI (Org A):** owner + editor.
- **Orbit Labs (Org B):** owner + viewer.
- Have credentials for an Org A owner and an Org B user.
- Keep the Org A workflow UUID available for the known-ID attack test.

## 0:00–0:45 — Two organizations and roles

Sign in as the Northstar AI owner. Show the organization selector, owner badge, and quota indicator. State that owner/editor/viewer are per-organization memberships rather than global JWT roles.

## 0:45–2:00 — Build the required workflow

Create a workflow and click **Load reviewer demo**. Show:

1. `llm_call` — Gemini sentiment analysis.
2. `conditional_branch` — positive goes to step 3; negative goes to step 5.
3. `http_request` — POST the positive analysis to an external HTTP endpoint.
4. `approval_gate` — human review.
5. `db_write` — persist the approved result.

Enable **Manual** and **Webhook** triggers. Enter a strong webhook secret and save. Point out that DB-write and webhook controls are marked owner-only.

## 2:00–3:20 — Manual run, subscription, pause, approval

Click **Run**. The Action returns a run ID immediately and the Live Execution panel subscribes to `step_runs`. Without refreshing, show the LLM, branch, and HTTP transitions, then the approval node becomes `waiting_approval` and the UI reads **Paused · awaiting approval**.

Click **Approve & resume**. The same run resumes, DB write completes, and the pipeline reaches Completed. Expand a step to show input/output and `attempt_count`.

## 3:20–4:10 — Start the same workflow without the Run button

Use Hasura GraphQL/curl with the public webhook Action:

```bash
curl "$NHOST_GRAPHQL_URL" \
  -H 'content-type: application/json' \
  --data '{
    "query":"mutation($id:uuid!,$secret:String!,$payload:json){ webhookTrigger(workflow_id:$id,secret:$secret,payload:$payload){ run_id status } }",
    "variables":{"id":"ORG_A_WORKFLOW_ID","secret":"DEMO_SECRET","payload":{"source":"recording"}}
  }'
```

Show the returned run ID/new run. Optionally also configure `db_event` for `demo.created`, click **Emit DB event**, and show a run started through the Hasura Event Trigger.

## 4:10–5:30 — Known-ID cross-organization attack

Copy the Org A workflow ID and, if possible, an Org A waiting approval step-run ID. Sign out and sign in as the Orbit Labs user.

First show the normal UI: Northstar data is absent. Then send this query with the **Org B user's bearer token** and the known Org A UUID:

```graphql
query GuessOrgAWorkflow($id: uuid!) {
  workflows_by_pk(id: $id) { id name org_id }
}
```

Expected: `workflows_by_pk: null`.

Try to trigger that known workflow:

```graphql
mutation GuessTrigger($id: uuid!) {
  triggerWorkflowRun(workflow_id: $id, input: { attack: "known-id" }) {
    run_id
    status
  }
}
```

Expected: authorization error and no run.

If an Org A run is paused, try:

```graphql
mutation GuessApproval($id: uuid!) {
  approveStep(step_run_id: $id) { run_id status }
}
```

Expected: authorization error and the Org A step remains waiting. The repository's `npm run security:smoke` automates the same checks.

## 5:30–6:00 — Close with quota/source proof

Return to Org A and show quota usage after a completed run. Briefly show `nhost/migrations`, `nhost/metadata`, and `functions` in the repo so the reviewer can see the live behavior is backed by version-controlled schema, permissions, Actions, and triggers.
