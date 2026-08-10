# AgentFlow Demo Walkthrough

Use the stable production URL:

`https://ai-agent-workflow-builder-seven.vercel.app`

## Before the demo

- Confirm the production deployment is ready and hard-refresh once.
- Sign in as the Northstar AI owner and keep the final reviewer workflow visible.
- Confirm the workflow contains all six step types.
- Keep passwords, access tokens, admin secrets, API keys, and webhook secrets hidden.

## Product, organizations, and roles

Sign in as **Owner A · Northstar AI** and show:

- **Northstar AI · owner** in the organization selector;
- the owner role badge;
- the monthly quota card;
- the final workflow in the sidebar.

Owner, editor, and viewer are organization memberships rather than global roles.

## Workflow structure

Open the final reviewer workflow and show the six nodes:

1. `llm_call` — Gemini sentiment classification using `gemini-3.5-flash-lite`.
2. `conditional_branch` — `POSITIVE` routes to step 3; `NEGATIVE` routes directly to step 4.
3. `http_request` — external POST with a templated JSON body containing runtime data.
4. `approval_gate` — human review before persistence.
5. `db_write` — protected result persistence.
6. `notify` — protected completion notification.

Manual and webhook triggers are enabled. DB write, notification, and webhook configuration are owner-protected capabilities.

## Positive manual run

Click **Run workflow** and watch the live execution panel update without refreshing the page.

Expected execution:

```text
Gemini               completed → POSITIVE
Conditional branch   completed → target step 3
HTTP POST             completed
Approval gate         waiting_approval
DB write              pending
Notification          pending
```

At the approval gate, click **Approve and resume**.

The same run should continue through:

```text
Approval gate         completed
DB write              completed
Notification          completed
Workflow              completed
```

This demonstrates live execution, pause/resume behavior, protected persistence, and completion notification.

## Negative branch

Trigger the same workflow with a negative input through the webhook path.

Expected result:

```text
trigger_type         webhook
Gemini               NEGATIVE
conditional branch   _branch_target = 4
HTTP request         skipped
approval gate        waiting_approval
```

This proves that conditional routing changes the actual execution path rather than acting as a visual-only branch.

## Editor approval

While a Northstar AI run is waiting at the approval gate, sign in as **Editor A · Northstar AI**.

Show that the editor:

- can see the Northstar workflow;
- can see the waiting approval step;
- can approve and resume the configured approval gate;
- cannot configure owner-only DB, notification, or webhook capabilities.

Approve the waiting gate and confirm that the same run resumes to completion.

## Viewer isolation

Sign in as **Viewer B · Orbit Labs**.

Show that:

- only **Orbit Labs** is visible;
- Northstar workflows are absent;
- the workspace is read-only;
- Run, Save, workflow creation, and restricted mutation controls are unavailable.

For direct-ID isolation, query the known Northstar workflow UUID under the Orbit Labs viewer context:

```graphql
query CrossOrgIsolation($workflowId: uuid!) {
  workflows_by_pk(id: $workflowId) {
    id
    name
    org_id
  }
}
```

Expected response:

```json
{
  "data": {
    "workflows_by_pk": null
  }
}
```

This demonstrates that organization isolation is enforced by Hasura row-level permissions rather than only by the frontend.

The repository also includes `npm run security:smoke` for known-ID cross-organization read, trigger, and approval checks.

## Implementation references

The main implementation areas are:

- `functions/_lib/runner.ts` — execution, retry behavior, conditional routing, and pause/resume semantics;
- `nhost/migrations/default/` — schema, quota settlement, and usage aggregation;
- `nhost/metadata/` — Hasura permissions, relationships, Actions, Event Triggers, and Cron Triggers;
- `scripts/security-smoke.mjs` — cross-organization security checks.

Finish by returning to the live application or the repository overview.
