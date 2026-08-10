# AgentFlow

**Secure, multi-tenant AI workflow orchestration with live execution, conditional routing, human approval, and role-aware controls.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-6366F1?style=for-the-badge&logo=vercel&logoColor=white)](https://ai-agent-workflow-builder-seven.vercel.app)
[![CI](https://img.shields.io/github/actions/workflow/status/ashh-droid/ai-agent-workflow-builder/ci.yml?style=for-the-badge&label=CI)](https://github.com/ashh-droid/ai-agent-workflow-builder/actions/workflows/ci.yml)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Hasura](https://img.shields.io/badge/Hasura-GraphQL-1EB4D4?logo=hasura)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14-336791?logo=postgresql)
![Nhost](https://img.shields.io/badge/Nhost-Auth%20%2B%20Functions-4F46E5)
![Gemini](https://img.shields.io/badge/Gemini-3.5%20Flash--Lite-4285F4?logo=google)

## Try it in two minutes

Open the **[live app](https://ai-agent-workflow-builder-seven.vercel.app)**. The login screen includes four isolated reviewer accounts, so no setup is required.

1. Choose **Owner A · Northstar AI** and sign in.
2. Open the completed workflow or click **Load best demo**.
3. Click **Run workflow** and watch the right-hand execution timeline update live.
4. At the approval gate, click **Approve and resume**.
5. Confirm the same run continues through protected persistence and notification.
6. Sign in as **Viewer B · Orbit Labs** to verify that cross-organization data and execution controls are unavailable.

The strongest reviewer workflow is:

```text
Gemini LLM
   ↓
Conditional branch
   ├─ POSITIVE → real HTTP request ─┐
   └─ NEGATIVE ────────────────────┤
                                   ↓
                           Human approval
                                   ↓
                           Database write
                                   ↓
                            Notification
```

Manual and webhook triggers are enabled. A negative input skips the HTTP node, which makes the conditional branch visibly change execution rather than acting as a decorative step.

## What AgentFlow demonstrates

| Capability | What to look for |
|---|---|
| **Multi-tenant isolation** | Northstar AI and Orbit Labs have independent memberships and data visibility. |
| **Role-aware workflow building** | Owners can use protected DB/notify/webhook capabilities; editors have narrower write access; viewers are read-only. |
| **Real AI execution** | Gemini classifies runtime input inside an `llm_call` node. |
| **True conditional routing** | The branch changes the next executed step based on Gemini output. |
| **Human-in-the-loop control** | `approval_gate` pauses the run and resumes the exact same run after authorization. |
| **Live observability** | `step_runs` stream into the UI through GraphQL subscriptions without polling or page refresh. |
| **Non-manual execution** | Webhook, scheduled, and database-event trigger paths are wired through Hasura/Nhost. |
| **Quota accounting** | Run quota is reserved atomically and settled when execution finishes. |

## The architecture in 60 seconds

```text
Browser / Next.js
      │
      │ Nhost Auth JWT
      ▼
Hasura GraphQL
      │
      ├── row-level org permissions
      ├── saveWorkflow Action ─────── protected-node authorization
      ├── triggerWorkflowRun Action ─ quota reservation + immutable run snapshot
      ├── approveStep Action ──────── approver authorization + resume
      └── webhookTrigger Action ───── hashed-secret verification
      │
      ▼
PostgreSQL workflow_runs INSERT
      │
      ▼
Hasura Event Trigger
      │
      ▼
Nhost execution worker
      │
      ├── Gemini
      ├── conditional branch
      ├── HTTP
      ├── approval pause/resume
      ├── DB persistence
      └── notification outbox
      │
      ▼
step_runs updates ── GraphQL subscription ──► live browser timeline
```

The important design choice is that **`triggerWorkflowRun` does not execute the whole workflow synchronously**. It authenticates the caller, reserves quota, snapshots the workflow into execution records, returns the run ID immediately, and lets an Event Trigger start the worker. That allows long-running or paused workflows to remain observable and resumable without holding an HTTP request open.

## Security model

AgentFlow uses two separate authorization layers rather than trusting UI visibility.

**Hasura row permissions** provide organization isolation. Every browser-facing query is scoped through `org_members` and the Nhost JWT user ID. A user in Orbit Labs cannot read Northstar AI rows simply by knowing their UUIDs.

**Action/function authorization** protects business operations. `saveWorkflow`, `triggerWorkflowRun`, `approveStep`, and webhook execution independently verify membership and role before using elevated backend access.

Additional hardening includes:

- hashed webhook secrets;
- SSRF protection and timeouts for HTTP nodes;
- immutable step snapshots for in-flight runs;
- one retry for LLM and HTTP failures with `attempt_count` recorded;
- atomic quota reservation/settlement;
- read-only execution tables for ordinary browser users;
- CSP, HSTS, clickjacking protection, MIME-sniffing protection, restrictive referrer policy, and browser permissions policy on the deployed frontend;
- Gemini, Hasura admin/JWT, webhook, and Grafana secrets kept server-side in Nhost.

A dedicated [`security:smoke`](scripts/security-smoke.mjs) test verifies known-ID cross-org attacks against workflow reads, run triggering, and approval.

## Reviewer proof checklist

The project is designed around the assignment's highest-weighted final scenario:

- [x] Two organizations with owner/editor/viewer membership boundaries
- [x] Workflow builder with `llm_call`, `http_request`, `conditional_branch`, `approval_gate`, `db_write`, and `notify`
- [x] Manual execution plus working non-manual trigger paths
- [x] Retry-aware asynchronous execution engine
- [x] Approval pause → authorized resume of the same run
- [x] Live GraphQL subscription updates
- [x] Org-level quota/usage aggregation through PostgreSQL/Hasura
- [x] Cross-org direct-ID read/trigger/approval attempts rejected server-side

For the implementation rationale, see **[`WRITEUP.md`](WRITEUP.md)**. For the short recording flow, see **[`docs/DEMO.md`](docs/DEMO.md)**. For the architecture breakdown, see **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

## Repository map

```text
src/                         Next.js reviewer UI, workflow builder, live run viewer
functions/                   Nhost Actions/event handlers and execution engine
functions/_lib/              authorization, runner, quota, templating, HTTP security
nhost/migrations/default/    PostgreSQL schema and database logic
nhost/metadata/              Hasura permissions, relationships, Actions, triggers
scripts/security-smoke.mjs   cross-organization attack verification
docs/                        architecture, demo and deployment documentation
WRITEUP.md                   concise design/security rationale
```

## Technology choices

- **Next.js + React** for the browser application
- **Nhost Auth** for user sessions and Hasura-compatible JWT claims
- **Hasura GraphQL** for queries, mutations, Actions, subscriptions, row permissions, Event Triggers and Cron Triggers
- **PostgreSQL 14** for durable workflow state, quota accounting and aggregation
- **Nhost Functions** for trusted workflow execution and runtime authorization
- **Gemini 3.5 Flash-Lite** for the AI node used in the live reviewer workflow
- **Vercel** for the public frontend deployment

Production uses the **Nhost Frankfurt (`eu-central-1`)** backend.

<details>
<summary><strong>Run locally</strong></summary>

### Requirements

- Node.js 22+
- Docker
- Nhost CLI
- Gemini API key

### Install

```bash
npm ci
npm ci --prefix functions
```

Copy `.secrets.example` to `.secrets` and provide backend-only secrets, then start Nhost:

```bash
nhost up
```

Copy `.env.example` to `.env.local` if you need non-default frontend endpoints, then run:

```bash
npm run dev
```

Open `http://localhost:3000`.

The committed `package-lock.json` files keep frontend and Function installs reproducible.

</details>

<details>
<summary><strong>Validation</strong></summary>

```bash
npm run typecheck
npm run typecheck:functions
npm run build
```

GitHub Actions additionally validates the Nhost configuration, Hasura Action SDL, PostgreSQL migration apply/rollback on PostgreSQL 14, both TypeScript projects, and the Next.js production build.

</details>

---

**Live application:** https://ai-agent-workflow-builder-seven.vercel.app  
**Architecture rationale:** [`WRITEUP.md`](WRITEUP.md)  
**Demo walkthrough:** [`docs/DEMO.md`](docs/DEMO.md)
