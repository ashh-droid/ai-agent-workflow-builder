# AgentFlow — AI Agent Workflow Builder

A security-first, multi-tenant workflow engine for chaining AI-agent steps. This repository implements the assignment as one end-to-end system: Nhost Auth, PostgreSQL, Hasura permissions/Actions/Event Triggers, Nhost Functions, GraphQL subscriptions, Gemini, and Next.js.

## What the final demo proves

1. Two organizations exist with independent `owner`, `editor`, and `viewer` memberships.
2. Org A can build a workflow containing `llm_call`, `http_request`, `conditional_branch`, `approval_gate`, `db_write`, and `notify` nodes.
3. A workflow can start manually and through webhook, scheduled, or database-event paths.
4. An approval gate pauses the same run and only an authorized member of that organization can resume it.
5. `step_runs` stream live over a GraphQL subscription with no polling/page refresh.
6. An Org B user cannot read, trigger, or approve Org A resources even when the Org A UUID is already known.

See [`WRITEUP.md`](WRITEUP.md) for the design reasoning and [`docs/DEMO.md`](docs/DEMO.md) for the exact recording script.

## Architecture

```text
Next.js browser
   │ Nhost Auth JWT
   ▼
Hasura GraphQL ───────── subscriptions ───────► live step-run UI
   │
   ├─ row permissions: X-Hasura-User-Id → org_members → org_id
   ├─ Action saveWorkflow ───────► restricted-node role checks
   ├─ Action triggerWorkflowRun ─► quota reservation + run snapshot
   ├─ Action approveStep ────────► approver role check + resume
   └─ Action webhookTrigger ─────► hashed-secret verification
                                      │
workflow_runs INSERT ─ Event Trigger ─┴─► execution worker
                                            │
                         Gemini / HTTP / branch / approval / DB / notify
                                            │
                         step_runs updates ◄─┘
                                            │
notifications INSERT ─ Event Trigger ───────► delivery handler
```

### Why the Run Action returns immediately

`triggerWorkflowRun` authenticates the caller, reserves one quota slot atomically, creates the run plus a snapshot of all `step_runs`, and returns the run ID. A Hasura Event Trigger then executes the run asynchronously. The browser can therefore attach its subscription immediately and visibly stream `pending → running → waiting_approval → approved/completed`.

## Security model

### Layer 1 — organization isolation in Hasura

The Nhost JWT uses the normal Hasura transport role `user`. Application roles are stored in `org_members`, because one person can be an owner in one organization and a viewer in another. Every user-facing table permission resolves the caller through `X-Hasura-User-Id` and the row's organization relationship.

Execution tables (`workflow_runs`, `step_runs`) are read-only to ordinary browser users. Server Functions perform state changes through the admin API after their own authorization checks. The SQL schema also carries `org_id` through workflow/execution records and uses composite foreign keys, preventing mixed-organization relationships.

### Layer 2 — runtime/business authorization in Actions

`saveWorkflow` independently checks membership. Only owners can add/change/remove `db_write`, `notify`, or webhook-trigger definitions. Editors can edit normal nodes while preserving owner-only definitions. `approveStep` resolves the step's organization and checks the approver's membership in code before resuming the run. A guessed UUID is therefore insufficient.

Additional hardening includes hashed webhook secrets, SSRF protection for generic HTTP nodes, timeouts, one retry for LLM/HTTP calls, immutable step snapshots, atomic quota settlement, and notification delivery through an Event Trigger outbox.

## Repository structure

```text
.
├── src/                       # Next.js app + workflow builder + live run viewer
├── functions/                 # Nhost Functions
│   ├── _lib/                  # runner, auth, quota, templates, security
│   └── events/                # run, database, notification, scheduler handlers
├── nhost/
│   ├── nhost.toml
│   ├── migrations/default/    # PostgreSQL schema
│   └── metadata/              # Hasura relationships/permissions/Actions/triggers
├── scripts/
│   ├── seed-demo.mjs
│   └── security-smoke.mjs
├── docs/
│   ├── ASSIGNMENT.md
│   ├── ARCHITECTURE.md
│   ├── DEMO.md
│   ├── DEPLOYMENT.md
│   └── IMPLEMENTATION_STATUS.md
└── WRITEUP.md
```

## Prerequisites

- Node.js 22+
- Docker + Nhost CLI for the local Nhost stack
- Gemini API key (Google AI Studio)
- Nhost account for the hosted backend

For Windows local Nhost development, use WSL2.

## Local setup

### 1. Install dependencies

```bash
npm install
npm install --prefix functions
```

### 2. Configure backend secrets

Copy `.secrets.example` to `.secrets` and replace every placeholder:

```toml
HASURA_GRAPHQL_ADMIN_SECRET = 'strong-random-value'
HASURA_GRAPHQL_JWT_SECRET = 'another-strong-random-value'
NHOST_WEBHOOK_SECRET = 'another-strong-random-value'
GEMINI_API_KEY = 'your-google-ai-studio-key'
```

`.secrets` is gitignored. `GEMINI_API_KEY` is backend-only and is never a `NEXT_PUBLIC_*` variable.

### 3. Start Nhost

```bash
nhost up
```

The Nhost project applies the SQL migration and Hasura metadata in this repository and serves the Functions in `functions/`.

### 4. Configure the Next.js app

Copy `.env.example` to `.env.local`. For the default local stack the included fallback URLs are sufficient; for a cloud project fill in the project values.

Start the frontend:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Demo data

Create four Nhost Auth accounts first:

- `owner-a@example.com`
- `editor-a@example.com`
- `owner-b@example.com`
- `viewer-b@example.com`

You can override those names through the `DEMO_*_EMAIL` environment variables.

Then, from a trusted terminal only:

```bash
export NHOST_GRAPHQL_URL='https://YOUR_PROJECT.graphql.YOUR_REGION.nhost.run/v1'
export NHOST_ADMIN_SECRET='YOUR_ADMIN_SECRET'
npm run seed:demo
```

The script creates:

- **Northstar AI (Org A):** owner + editor
- **Orbit Labs (Org B):** owner + viewer

It prints the two organization UUIDs for the walkthrough.

## Build the required workflow

Sign in as the Org A owner, create a workflow, and click **Load reviewer demo**. It creates:

1. Gemini `llm_call` returning structured sentiment JSON.
2. `conditional_branch` routing positive output to the HTTP step and negative output directly to persistence.
3. Real `http_request` to `https://httpbin.org/post`.
4. `approval_gate` that pauses the run.
5. Owner-only `db_write` into `workflow_results`.

Enable Manual and Webhook triggers and save. The browser deliberately hides/disables restricted controls for lower roles, while the server Action remains the actual enforcement boundary.

## Manual run + live subscription

Click **Run**. The Action returns a run ID immediately; the right-side panel subscribes to `step_runs(workflow_run_id = runId)`. When the approval gate is reached, the UI displays **Paused · awaiting approval**. Clicking **Approve & resume** invokes the protected `approveStep` Action and continues the same run.

## Webhook run

The inbound webhook is itself a public Hasura Action; no frontend/admin token is required, but the configured workflow secret is required:

```bash
curl "$NHOST_GRAPHQL_URL" \
  -H 'content-type: application/json' \
  --data '{
    "query":"mutation($id:uuid!,$secret:String!,$payload:json){ webhookTrigger(workflow_id:$id,secret:$secret,payload:$payload){ run_id status } }",
    "variables":{"id":"WORKFLOW_UUID","secret":"YOUR_WEBHOOK_SECRET","payload":{"source":"curl"}}
  }'
```

Secrets are hashed before storage and are not exposed in the workflow-trigger select permission.

## Scheduled and database-event starts

A Hasura Cron Trigger runs the scheduled dispatcher every minute. A workflow trigger such as `*/5 * * * *` is evaluated in UTC and enqueued when due.

For database events, configure a workflow `db_event` trigger with an event name such as `demo.created`. An owner/editor can insert a `trigger_events` row; Hasura's Event Trigger calls the database dispatcher, which starts matching workflows. The UI includes **Emit DB event** for the demo.

## Notify node

A `notify` step does not send a message inline. The runner inserts into `notifications`; the `notification_created` Hasura Event Trigger calls the notification handler. `demo` channel proves the event-driven flow without external credentials; Slack/email destinations can be configured server-side.

## Cross-org attack smoke test

Sign in as an Org B user, obtain its access token, and supply a known Org A workflow ID (plus an Org A approval step ID if available):

```bash
export NHOST_GRAPHQL_URL='https://.../v1'
export ORG_B_ACCESS_TOKEN='...'
export ORG_A_WORKFLOW_ID='...'
export ORG_A_STEP_RUN_ID='...'   # optional but recommended
npm run security:smoke
```

The script asserts that:

- direct Org A workflow read returns `null`;
- `triggerWorkflowRun` is rejected;
- `approveStep` is rejected.

## Validation

```bash
npm run typecheck
npm run typecheck:functions
npm run build
```

GitHub Actions runs dependency installation, both TypeScript checks, and the Next.js production build on every push/PR.

## Deployment / submission

Use [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the Nhost + manual Vercel checklist and [`docs/DEMO.md`](docs/DEMO.md) for the recording. The final submission consists of:

1. this GitHub repository;
2. the hosted Vercel URL;
3. the short final-task recording.
