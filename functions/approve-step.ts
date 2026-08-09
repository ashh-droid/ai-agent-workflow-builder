import type { Request, Response } from "express";
import { adminGraphql } from "./_lib/admin";
import { executeRun } from "./_lib/runner";
import { actionUserId, requireMembership, requireNhostWebhook, sendError } from "./_lib/security";
import type { ActionEnvelope } from "./_lib/types";

export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const envelope = req.body as ActionEnvelope<{ step_run_id: string }>;
    const userId = actionUserId(envelope.session_variables);
    const data = await adminGraphql<{ step_runs_by_pk: null | { id: string; org_id: string; step_type: string; status: string; step_config: Record<string, unknown>; workflow_run_id: string; workflow_run: { status: string } } }>(
      `query Approval($id: uuid!) { step_runs_by_pk(id: $id) { id org_id step_type status step_config workflow_run_id workflow_run { status } } }`,
      { id: envelope.input.step_run_id },
    );
    const step = data.step_runs_by_pk;
    if (!step) throw new Error("Not found or not authorized");
    const allowedRoles = step.step_config?.required_role === "owner" ? (["owner"] as const) : (["owner", "editor"] as const);
    await requireMembership(userId, step.org_id, [...allowedRoles]);
    if (step.step_type !== "approval_gate" || step.status !== "waiting_approval" || step.workflow_run.status !== "paused") throw new Error("Step is not awaiting approval");
    const now = new Date().toISOString();
    const updated = await adminGraphql<{ update_step_runs: { affected_rows: number } }>(`mutation Approve($id: uuid!, $userId: uuid!, $now: timestamptz!) { update_step_runs(where: {id: {_eq: $id}, status: {_eq: "waiting_approval"}}, _set: {status: "approved", approved_by: $userId, approved_at: $now, completed_at: $now}) { affected_rows } }`, { id: step.id, userId, now });
    if (updated.update_step_runs.affected_rows !== 1) throw new Error("Approval was already handled");
    await adminGraphql(`mutation Resume($runId: uuid!) { update_workflow_runs_by_pk(pk_columns: {id: $runId}, _set: {status: "running"}) { id } }`, { runId: step.workflow_run_id });
    const result = await executeRun(step.workflow_run_id);
    res.status(200).json({ run_id: step.workflow_run_id, step_run_id: step.id, status: result.status, message: "Approval recorded and run resumed" });
  } catch (error) { sendError(res, error); }
}
