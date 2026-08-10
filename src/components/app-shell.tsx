"use client";

import { ChevronDown, History, LogOut, Plus, Radio, Shield, Workflow as WorkflowIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

function bestWorkflow(workflows: Workflow[]) {
  return workflows.find((workflow) => /final/i.test(workflow.name) && workflow.runs?.[0]?.status === "completed")
    ?? workflows.find((workflow) => workflow.runs?.[0]?.status === "completed")
    ?? workflows.find((workflow) => workflow.runs?.[0]?.status !== "failed")
    ?? workflows[0];
}

function ExecutionPreview({ workflow, role }: { workflow: Workflow | null; role: OrgRole }) {
  const viewerEmpty = role === "viewer" && !workflow;

  return (
    <aside className="execution-panel execution-preview">
      <div className="execution-heading">
        <div>
          <span>Live execution</span>
          <small>{workflow ? "GraphQL subscription ready" : viewerEmpty ? "Read-only workspace" : "Select a saved workflow"}</small>
        </div>
        {workflow && <span className="status-badge ready">ready</span>}
      </div>

      {workflow ? (
        <>
          <div className="execution-preview-card">
            <span className="section-label">Execution path</span>
            <strong>{workflow.steps.length} guarded steps</strong>
            <p>State changes stream here in real time. Approval gates pause execution before protected writes continue.</p>
          </div>
          <div className="execution-timeline skeleton-timeline">
            {workflow.steps.map((step) => (
              <div className={`execution-step pending-dim step-${step.step_type}`} key={step.id ?? `${step.step_type}-${step.step_order}`}>
                <div className="execution-step-icon pending">{step.step_order}</div>
                <div className="execution-step-copy">
                  <span className="step-label">{step.name}</span>
                  <span className="step-detail">{step.step_type.replaceAll("_", " ")}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="execution-footer">
            <span className="section-label">Active triggers</span>
            <div className="trigger-pill-row">
              {workflow.triggers.filter((trigger) => trigger.is_active).map((trigger) => (
                <span className="trigger-pill" key={trigger.id ?? trigger.trigger_type}>{trigger.trigger_type.replaceAll("_", " ")}</span>
              ))}
              {!workflow.triggers.some((trigger) => trigger.is_active) && <span className="empty-trigger">none configured</span>}
            </div>
          </div>
        </>
      ) : (
        <div className="execution-empty">
          {viewerEmpty ? <Shield size={26} /> : <Radio size={26} />}
          <strong>{viewerEmpty ? "No workflow available" : "Select a workflow"}</strong>
          <span>{viewerEmpty
            ? "This viewer can only see workflows that belong to the current organization."
            : "The execution path, trigger state and live subscription will appear here."}</span>
        </div>
      )}
    </aside>
  );
}

export function AppShell() {
  const { nhost, session, isLoading } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id;

  const [{ data: orgData, fetching: orgLoading, error: orgError }] = useQuery<{ org_members: Membership[] }>({
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
  const healthyWorkflows = useMemo(() => workflows.filter((workflow) => workflow.runs?.[0]?.status !== "failed"), [workflows]);
  const failedWorkflows = useMemo(() => workflows.filter((workflow) => workflow.runs?.[0]?.status === "failed"), [workflows]);

  useEffect(() => {
    if (!orgId || fetching || !workspace) return;
    if (!workflows.length) {
      const emptySelection = role === "viewer" ? null : "new";
      if (workflowId !== emptySelection) setWorkflowId(emptySelection);
      return;
    }
    if (workflowId === "new") return;
    const currentExists = !!workflowId && workflows.some((workflow) => workflow.id === workflowId);
    if (!currentExists) setWorkflowId(bestWorkflow(workflows)?.id ?? null);
  }, [orgId, workflows, workflowId, fetching, workspace, role]);

  const selected = workflowId === "new" ? null : workflows.find((workflow) => workflow.id === workflowId) ?? null;
  const usage = workspace?.org_monthly_usage?.[0];
  const viewerHasNoWorkflows = role === "viewer" && !!workspace && !fetching && workflows.length === 0;

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
    setNotice(result.error
      ? result.error.message
      : "Database event inserted — matching db_event workflows will start via Hasura Event Trigger.");
  }

  async function signOut() {
    if (session?.refreshToken) await nhost.auth.signOut({ refreshToken: session.refreshToken });
    router.replace("/login");
  }

  if (isLoading || orgLoading || !session) {
    return <main className="loading-page"><div className="wordmark">agent<span>flow</span></div><p>Loading secure workspace…</p></main>;
  }

  if (orgError) {
    return (
      <main className="empty-page">
        <Shield size={28} />
        <h1>Could not load organization membership</h1>
        <p>{orgError.message}</p>
        <div className="row gap-sm"><button onClick={() => window.location.reload()} className="primary">Retry</button><button onClick={signOut} className="secondary">Sign out</button></div>
      </main>
    );
  }

  if (!memberships.length) {
    return (
      <main className="empty-page">
        <Shield size={28} />
        <h1>No organization membership yet</h1>
        <p>Create the demo organizations with <code>npm run seed:demo</code> after creating the demo Auth users, or follow README → Demo setup.</p>
        <button onClick={signOut} className="secondary">Sign out</button>
      </main>
    );
  }

  const signedInEmail = session.user?.email ?? "signed-in user";
  const quotaUsed = usage?.quota_used ?? membership?.organization.quota_used ?? 0;
  const quotaLimit = usage?.quota_limit ?? membership?.organization.quota_limit ?? 100;
  const quotaRemaining = usage?.quota_remaining ?? membership?.organization.quota_remaining ?? 0;

  function workflowButton(workflow: Workflow) {
    const latestStatus = workflow.runs?.[0]?.status;
    return (
      <button
        key={workflow.id}
        className={`workflow-list-item ${workflowId === workflow.id ? "active" : ""}`}
        onClick={() => { setWorkflowId(workflow.id!); setRunId(null); }}
      >
        <WorkflowIcon size={16} />
        <span>
          <strong>{workflow.name}</strong>
          <small>{workflow.steps.length} steps</small>
        </span>
        <em className={`workflow-list-status status-${latestStatus ?? "never"}`}>{statusLabel(latestStatus)}</em>
      </button>
    );
  }

  return (
    <main className="app-layout with-topbar">
      <header className="app-topbar">
        <div className="topbar-left">
          <div className="wordmark wordmark-small">agent<span>flow</span></div>
          <details className="org-switcher">
            <summary aria-label="Switch organization">
              <span>{membership?.organization.name ?? "Organization"}</span>
              <ChevronDown size={14} />
            </summary>
            <div className="org-switcher-menu">
              {memberships.map((item) => (
                <button
                  type="button"
                  className={item.organization.id === orgId ? "active" : ""}
                  key={item.organization.id}
                  onClick={(event) => {
                    setOrgId(item.organization.id);
                    setRunId(null);
                    setWorkflowId(null);
                    const details = event.currentTarget.closest("details");
                    if (details) details.open = false;
                  }}
                >
                  <span>{item.organization.name}</span>
                  <small>{item.role}</small>
                </button>
              ))}
            </div>
          </details>
          <span className="topbar-role-badge">{role}</span>
        </div>

        <div className="topbar-right">
          <div className="topbar-quota" title={`${quotaRemaining} available · ${usage?.quota_reserved ?? 0} reserved`}>
            <div><strong>{quotaUsed}</strong><span>of {quotaLimit} runs</span></div>
            <div className="quota-bar-track"><div className="quota-bar-fill" style={{ width: `${Math.min(100, (quotaUsed / Math.max(1, quotaLimit)) * 100)}%` }} /></div>
            <small>{quotaRemaining} available</small>
          </div>
          <button className="sign-out-button" onClick={signOut} title={`Sign out ${signedInEmail}`} aria-label={`Sign out ${signedInEmail}`}>
            <LogOut size={14} /><span>Sign out</span>
          </button>
        </div>
      </header>

      <aside className="app-sidebar">
        <div className="sidebar-intro">
          <span>Workflows</span>
          <strong>{healthyWorkflows.length}</strong>
        </div>
        <div className="sidebar-utility">
          {role !== "viewer" && (
            <button className="new-workflow-button" onClick={() => { setWorkflowId("new"); setRunId(null); }}>
              <Plus size={14} />New workflow
            </button>
          )}
        </div>
        <nav className="workflow-list">
          {healthyWorkflows.map(workflowButton)}
        </nav>

        {failedWorkflows.length > 0 && (
          <details className="development-history">
            <summary><History size={13} /><span>Development history</span><em>{failedWorkflows.length}</em><ChevronDown size={13} /></summary>
            <div className="development-history-list">{failedWorkflows.map(workflowButton)}</div>
          </details>
        )}

        <div className="sidebar-account"><span>{signedInEmail}</span><small>{role} access</small></div>
      </aside>

      <section className="workflow-canvas">
        {notice && <div className="info-banner"><Radio size={15} />{notice}</div>}
        {orgId && (viewerHasNoWorkflows ? (
          <div className="viewer-empty-state">
            <div className="viewer-empty-card">
              <div className="viewer-empty-icon"><Shield size={22} /></div>
              <span className="viewer-empty-eyebrow">Read-only workspace</span>
              <h1>No workflows available</h1>
              <p>This viewer can only access workflows that belong to this organization. There are currently no workflows visible in Orbit Labs.</p>
              <span className="viewer-empty-org">Orbit Labs · viewer access</span>
            </div>
          </div>
        ) : (
          <WorkflowBuilder
            orgId={orgId}
            role={role}
            workflow={selected}
            onSave={save}
            onRun={run}
            onDelete={deleteWorkflow}
            onEmitEvent={databaseEvent}
            starting={starting}
          />
        ))}
        {fetching && <div className="sync-pill">Syncing GraphQL…</div>}
      </section>

      {runId
        ? <RunViewer runId={runId} role={role} workflow={selected} onRunSettled={() => refresh({ requestPolicy: "network-only" })} />
        : <ExecutionPreview workflow={selected} role={role} />}
    </main>
  );
}
