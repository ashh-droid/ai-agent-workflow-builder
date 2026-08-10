"use client";

import { Check, Circle, Loader2, Pause, ShieldCheck, SkipForward, X } from "lucide-react";
import { useMutation, useSubscription } from "urql";
import { APPROVE_STEP, STEP_RUNS_SUBSCRIPTION } from "@/lib/graphql";
import type { OrgRole, StepRun, Workflow } from "@/lib/types";

function statusIcon(status: string) {
  if (["completed", "approved"].includes(status)) return <Check size={11} />;
  if (status === "running") return <Loader2 size={11} className="spin" />;
  if (status === "waiting_approval") return <Pause size={10} />;
  if (status === "skipped") return <SkipForward size={10} />;
  if (status === "failed") return <X size={10} />;
  return <Circle size={7} />;
}

function duration(step: StepRun) {
  if (!step.started_at || !step.completed_at) return null;
  const ms = new Date(step.completed_at).getTime() - new Date(step.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function outputSummary(step: StepRun) {
  const output = step.output as any;
  if (!output) return null;
  if (typeof output === "string") return output.slice(0, 60);
  if (typeof output?.text === "string") return output.text.slice(0, 60);
  if (typeof output?.status === "number") return `${output.status}`;
  if (typeof output?._branch_target === "number") return `→ step ${output._branch_target}`;
  return null;
}

export function RunViewer({
  runId,
  role,
  workflow,
  onRunSettled,
}: {
  runId: string;
  role: OrgRole;
  workflow?: Workflow | null;
  onRunSettled?: () => void;
}) {
  const [{ data, error }] = useSubscription<{ step_runs: StepRun[] }>({ query: STEP_RUNS_SUBSCRIPTION, variables: { runId } });
  const [{ fetching: approving }, approve] = useMutation(APPROVE_STEP);
  const steps = data?.step_runs ?? [];
  const waiting = steps.find((step) => step.status === "waiting_approval");
  const allDone = steps.length > 0 && steps.every((step) => ["completed", "approved", "skipped"].includes(step.status));
  const failed = steps.find((step) => step.status === "failed");
  const runState = failed ? "failed" : waiting ? "paused" : allDone ? "completed" : "running";
  const latestOutput = [...steps].reverse().find((step) => step.output)?.output;

  async function approveStep(stepRunId: string) {
    const result = await approve({ stepRunId });
    if (!result.error) onRunSettled?.();
  }

  return (
    <aside className="execution-panel live-execution-panel">
      <div className="execution-heading">
        <div><span>Live execution</span><small>Run {runId.slice(0, 8)}</small></div>
        <span className={`status-badge ${runState}`}>{runState === "paused" ? "⏸ paused" : runState === "completed" ? "✓ done" : runState === "failed" ? "✕ failed" : "● running"}</span>
      </div>

      <div className="execution-meta">{runId.slice(0, 8)} · live subscription</div>
      {error && <div className="error-banner compact-banner">Subscription error: {error.message}</div>}

      <div className="execution-timeline">
        {steps.map((step) => {
          const time = duration(step);
          const summary = outputSummary(step);
          const paused = step.status === "waiting_approval";
          const pending = step.status === "pending";
          const hasInspectionData = Boolean(step.error) || step.input != null || step.output != null;
          return (
            <div className={`execution-step step-${step.step_type} ${paused ? "paused-highlight" : ""} ${pending ? "pending-dim" : ""}`} key={step.id}>
              <div className={`execution-step-icon ${step.status}`}>{statusIcon(step.status)}</div>
              <div className="execution-step-copy">
                <span className="step-label">{step.step_name}</span>
                <span className="step-detail">{paused ? "Waiting for approval" : step.status === "skipped" ? "branch skipped" : [time, summary].filter(Boolean).join(" · ") || step.status.replaceAll("_", " ")}</span>
              </div>
              <span className="attempt-count">{step.attempt_count}/{Math.max(1, step.attempt_count)}</span>
              {paused && role !== "viewer" && (
                <button className="execution-approve" disabled={approving} onClick={() => void approveStep(step.id)}>
                  <ShieldCheck size={13} />{approving ? "Approving…" : "Approve and resume"}
                </button>
              )}
              {hasInspectionData && (
                <details className="execution-details">
                  <summary>Inspect</summary>
                  <pre>{JSON.stringify({ input: step.input, output: step.output, error: step.error }, null, 2)}</pre>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <div className="execution-footer">
        <span className="section-label">Active triggers</span>
        <div className="trigger-pill-row">
          {workflow?.triggers.filter((trigger) => trigger.is_active).map((trigger) => <span className="trigger-pill" key={trigger.id ?? trigger.trigger_type}>{trigger.trigger_type.replaceAll("_", " ")}</span>)}
          {!workflow?.triggers.some((trigger) => trigger.is_active) && <span className="empty-trigger">none configured</span>}
        </div>
      </div>

      {latestOutput != null && (
        <div className="latest-output">
          <span className="section-label">Latest output</span>
          <pre className="output-block">{JSON.stringify(latestOutput, null, 2)}</pre>
        </div>
      )}
    </aside>
  );
}
