"use client";

import { DatabaseZap, LogOut, Play, Plus, Radio, Shield, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "urql";
import { DELETE_WORKFLOW, INSERT_TRIGGER_EVENT, MY_ORGS, ORG_WORKSPACE, SAVE_WORKFLOW, TRIGGER_RUN } from "@/lib/graphql";
import type { Membership, OrgRole, Workflow } from "@/lib/types";
import { useAuth } from "./providers";
import { RunViewer } from "./run-viewer";
import { WorkflowBuilder } from "./workflow-builder";

function statusLabel(status?: string) {
  if (!status) return "never run";
  if (status === "waiting_approval") return "awaiting approval";
  return status.replaceAll("_", " ");
}

export function AppShell() {
  const { nhost, session, isLoading } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id;

  const [{ data: orgData, fetching: orgLoading, error: orgError }] = useQuery<{
    org_members: Membership[];
  }>({
    query: MY_ORGS,
    variables: { userId },
    pause: !userId,
  });

  const [orgId, setOrgId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | "new" | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.replace("/login");
  }, [isLoading, session, router]);

  const memberships = orgData?.org_members ?? [];

  useEffect(() => {
    if (!orgId && memberships[0]) setOrgId(memberships[0].organization.id);
  }, [memberships, orgId]);

  const membership = memberships.find((item) => item.organization.id === orgId);
  const role: OrgRole = membership?.role ?? "viewer";

  const [{ data: workspace, fetching }, refresh] = useQuery<any>({
    query: ORG_WORKSPACE,
    variables: { orgId },
    pause: !orgId,
    requestPolicy: "cache-and-network",
  });

  const workflows: Workflow[] = workspace?.workflows ?? [];

  useEffect(() => {
    if (orgId && workflowId !== "new" && !workflows.some((wf) => wf.id === workflowId)) {
      setWorkflowId(workflows[0]?.id ?? "new");
    }
  }, [orgId, workflows, workflowId]);

  const selected = workflowId === "new" ? null : workflows.find((wf) => wf.id === workflowId) ?? null;
  const usage = workspace?.org_monthly_usage?.[0];

  const [, saveMutation] = useMutation(SAVE_WORKFLOW);
  const [, deleteMutation] = useMutation(DELETE_WORKFLOW);
  const [{ fetching: starting }, startRun] = useMutation(TRIGGER_RUN);
  const [, emitEvent] = useMutation(INSERT_TRIGGER_EVENT);

  async function save(workflow: Workflow) {
    const result = await saveMutation({ payload: workflow });
    if (result.error) throw result.error;
    const id = result.data?.saveWorkflow?.workflow_id;
    if (id) setWorkflowId(id);
    refresh({ requestPolicy: "network-only" });
  }

  async function deleteWorkflow() {
    if (!selected?.id || role !== "owner") return;
    const confirmed = window.confirm(`Delete “${selected.name}” and its run history? This cannot be undone.`);
    if (!confirmed) return;
    const result = await deleteMutation({ workflowId: selected.id });
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setRunId(null);
    setWorkflowId(null);
    setNotice(`Deleted ${selected.name}.`);
    refresh({ requestPolicy: "network-only" });
  }

  async function run() {
    if (!selected?.id || role === "viewer") return;
    setNotice(null);
    const result = await startRun({
      workflowId: selected.id,
      input: { text: "The product launch exceeded all expectations and customers are delighted." },
    });
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setRunId(result.data?.triggerWorkflowRun?.run_id ?? null);
    refresh({ requestPolicy: "network-only" });
  }

  async function databaseEvent() {
    if (!orgId || role === "viewer") return;
    const result = await emitEvent({
      orgId,
      eventName: "demo.created",
      payload: { source: "ui", at: new Date().toISOString() },
    });
    setNotice(
      result.error
        ? result.error.message
        : "Database event inserted — matching db_event workflows will start via Hasura Event Trigger.",
    );
  }

  async function signOut() {
    if (session?.refreshToken) await nhost.auth.signOut({ refreshToken: session.refreshToken });
    router.replace("/login");
  }

  if (isLoading || orgLoading || !session) {
    return (
      <main className="loading-page">
        <div className="pulse-logo">AG</div>
        <p>Loading secure workspace…</p>
      </main>
    );
  }

  if (orgError) {
    return (
      <main className="empty-page">
        <Shield size={28} />
        <h1>Could not load organization membership</h1>
        <p>{orgError.message}</p>
        <div className="row gap-sm">
          <button onClick={() => window.location.reload()} className="primary">Retry</button>
          <button onClick={signOut} className="secondary">Sign out</button>
        </div>
      </main>
    );
  }

  if (!memberships.length) {
    return (
      <main className="empty-page">
        <Shield size={28} />
        <h1>No organization membership yet</h1>
        <p>
          Create the demo organizations with <code>npm run seed:demo</code> after creating the demo Auth users,
          or follow README → Demo setup.
        </p>
        <button onClick={signOut} className="secondary">Sign out</button>
      </main>
    );
  }

  const signedInEmail = session.user?.email ?? "signed-in user";

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">AG</div>
          <div><strong>AgentFlow</strong><span>secure orchestration</span></div>
        </div>

        <label className="org-select">
          Organization
          <select
            value={orgId ?? ""}
            onChange={(e) => {
              setOrgId(e.target.value);
              setRunId(null);
              setWorkflowId(null);
            }}
          >
            {memberships.map((item) => (
              <option value={item.organization.id} key={item.organization.id}>
                {item.organization.name} · {item.role}
              </option>
            ))}
          </select>
        </label>

        <div className="quota-card">
          <div className="quota-head">
            <span>Monthly quota</span>
            <strong>
              {usage?.quota_used ?? membership?.organization.quota_used ?? 0} / {usage?.quota_limit ?? membership?.organization.quota_limit ?? 0}
            </strong>
          </div>
          <div className="progress">
            <span
              style={{
                width: `${Math.min(100, ((usage?.quota_used ?? 0) / Math.max(1, usage?.quota_limit ?? 1)) * 100)}%`,
              }}
            />
          </div>
          <small>{usage?.quota_reserved ?? 0} reserved · {usage?.quota_remaining ?? 0} available</small>
          <div className="quota-stats">
            <span><strong>{usage?.total_runs_this_month ?? 0}</strong> runs</span>
            <span><strong>{usage?.successful_runs ?? 0}</strong> completed</span>
          </div>
        </div>

        <div className="sidebar-title">
          <span>Workflows</span>
          {role !== "viewer" && (
            <button
              className="icon-btn"
              aria-label="Create workflow"
              onClick={() => {
                setWorkflowId("new");
                setRunId(null);
              }}
            >
              <Plus size={15} />
            </button>
          )}
        </div>

        <nav className="workflow-nav">
          {workflows.map((wf) => {
            const latestStatus = wf.runs?.[0]?.status;
            return (
              <button
                key={wf.id}
                className={workflowId === wf.id ? "active" : ""}
                onClick={() => {
                  setWorkflowId(wf.id!);
                  setRunId(null);
                }}
              >
                <WorkflowIcon size={15} />
                <span>
                  <strong>{wf.name}</strong>
                  <small className={`workflow-status workflow-status-${latestStatus ?? "never"}`}>
                    {statusLabel(latestStatus)}
                  </small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span>{signedInEmail}</span>
          <button onClick={signOut} className="icon-btn" aria-label="Sign out"><LogOut size={15} /></button>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{membership?.organization.name}</p>
            <h1>{selected?.name ?? (workflowId === "new" ? "Create workflow" : "Workflow workspace")}</h1>
            {selected?.description && <p className="topbar-description">{selected.description}</p>}
          </div>
          <div className="row gap-sm topbar-actions">
            <span className={`role-badge role-${role}`}><Shield size={13} />{role}</span>
            {selected && role === "owner" && (
              <button className="secondary danger-button" onClick={() => void deleteWorkflow()}><Trash2 size={15} />Delete</button>
            )}
            {selected && role !== "viewer" && (
              <button className="secondary" onClick={databaseEvent}><DatabaseZap size={15} />Emit DB event</button>
            )}
            {selected && role !== "viewer" && (
              <button className="primary" onClick={run} disabled={starting}><Play size={15} />{starting ? "Queueing…" : "Run"}</button>
            )}
          </div>
        </header>

        {notice && <div className="info-banner"><Radio size={15} />{notice}</div>}

        <div className="content-grid">
          {orgId && <WorkflowBuilder orgId={orgId} role={role} workflow={selected} onSave={save} />}
          {runId ? (
            <RunViewer
              runId={runId}
              role={role}
              onRunSettled={() => refresh({ requestPolicy: "network-only" })}
            />
          ) : (
            <section className="run-panel preview-run">
              <div className="section-heading preview-heading">
                <div>
                  <p className="eyebrow">EXECUTION PREVIEW</p>
                  <h2>{selected ? "Ready to stream" : "Live run stream"}</h2>
                </div>
                {selected && <span className="run-state idle">Ready</span>}
              </div>
              {selected ? (
                <>
                  <p className="preview-copy">Run this workflow to stream step state changes here through a GraphQL subscription — no polling or page refresh.</p>
                  <div className="preview-pipeline">
                    {selected.steps.map((step) => (
                      <div className={`preview-step step-${step.step_type}`} key={step.id ?? `${step.step_type}-${step.step_order}`}>
                        <span className="preview-dot" />
                        <div>
                          <strong>{step.name}</strong>
                          <small>{step.step_type.replaceAll("_", " ")}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-run-inner">
                  <Radio size={24} />
                  <p>Select a workflow or create one to preview its execution pipeline.</p>
                </div>
              )}
            </section>
          )}
        </div>

        {fetching && <div className="sync-pill">Syncing GraphQL…</div>}
      </section>
    </main>
  );
}
