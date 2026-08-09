"use client";

import { Check, Circle, Loader2, Pause, ShieldCheck, SkipForward, X } from "lucide-react";
import { useMutation, useSubscription } from "urql";
import { APPROVE_STEP, STEP_RUNS_SUBSCRIPTION } from "@/lib/graphql";
import type { OrgRole, StepRun } from "@/lib/types";

function icon(status: string) {
  if (["completed", "approved"].includes(status)) return <Check size={16} />;
  if (status === "running") return <Loader2 size={16} className="spin" />;
  if (status === "waiting_approval") return <Pause size={16} />;
  if (status === "skipped") return <SkipForward size={16} />;
  if (status === "failed") return <X size={16} />;
  return <Circle size={14} />;
}

export function RunViewer({ runId, role, onRunSettled }: { runId: string; role: OrgRole; onRunSettled?: () => void }) {
  const [{ data, error }] = useSubscription<{ step_runs: StepRun[] }>({ query: STEP_RUNS_SUBSCRIPTION, variables: { runId } });
  const [{ fetching: approving }, approve] = useMutation(APPROVE_STEP);
  const steps = data?.step_runs ?? [];
  const waiting = steps.find((step) => step.status === "waiting_approval");
  const allDone = steps.length > 0 && steps.every((step) => ["completed", "approved", "skipped"].includes(step.status));
  const failed = steps.find((step) => step.status === "failed");

  async function approveStep(stepRunId: string) {
    const result = await approve({ stepRunId });
    if (!result.error) onRunSettled?.();
  }

  return (
    <section className="run-panel live-run-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LIVE EXECUTION</p>
          <h2>Run {runId.slice(0, 8)}</h2>
        </div>
        <span className={`run-state ${failed ? "failed" : waiting ? "paused" : allDone ? "done" : "running"}`}>
          {failed ? "Failed" : waiting ? "Paused · awaiting approval" : allDone ? "Completed" : "Streaming"}
        </span>
      </div>
      {error && <div className="error-banner">Subscription error: {error.message}</div>}
      <div className="pipeline">
        {steps.map((step) => (
          <article key={step.id} className={`run-step step-${step.step_type} status-${step.status}`}>
            <div className="status-icon">{icon(step.status)}</div>
            <div className="run-step-main">
              <div className="run-step-title">
                <strong>{step.step_name}</strong>
                <span className="step-kind">{step.step_type.replaceAll("_", " ")}</span>
                <code>attempt {step.attempt_count}</code>
              </div>
              {step.error && <p className="step-error">{step.error}</p>}
              <details>
                <summary>Input / output</summary>
                <pre>{JSON.stringify({ input: step.input, output: step.output }, null, 2)}</pre>
              </details>
              {step.status === "waiting_approval" && role !== "viewer" && (
                <button className="approve" disabled={approving} onClick={() => void approveStep(step.id)}>
                  <ShieldCheck size={16} />{approving ? "Approving…" : "Approve & resume"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
