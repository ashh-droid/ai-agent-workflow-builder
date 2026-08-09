import type { Request, Response } from "express";
import { adminGraphql } from "../_lib/admin";
import { cronMatches, sameUtcMinute } from "../_lib/cron";
import { enqueueWorkflow } from "../_lib/enqueue";
import { resetExpiredQuotas } from "../_lib/quota-reset";
import { requireNhostWebhook, sendError } from "../_lib/security";

interface ScheduledTrigger { id: string; workflow_id: string; config: { cron?: string }; last_fired_at: string | null; workflow: { is_active: boolean } | null; }
export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const now = new Date();
    const quotaWindowsReset = await resetExpiredQuotas(now);
    const data = await adminGraphql<{ workflow_triggers: ScheduledTrigger[] }>(`query ScheduledTriggers { workflow_triggers(where: {trigger_type: {_eq: "scheduled"}, is_active: {_eq: true}}) { id workflow_id config last_fired_at workflow { is_active } } }`);
    const results: Array<{ trigger_id: string; run_id?: string; skipped?: string }> = [];
    for (const trigger of data.workflow_triggers) {
      const cron = trigger.config?.cron;
      if (!trigger.workflow?.is_active || typeof cron !== "string" || !cronMatches(cron, now) || sameUtcMinute(trigger.last_fired_at, now)) continue;
      try {
        const runId = await enqueueWorkflow(trigger.workflow_id, "scheduled", { scheduled_at: now.toISOString(), cron }, null);
        await adminGraphql(`mutation MarkFired($id: uuid!, $at: timestamptz!) { update_workflow_triggers_by_pk(pk_columns: {id: $id}, _set: {last_fired_at: $at}) { id } }`, { id: trigger.id, at: now.toISOString() });
        results.push({ trigger_id: trigger.id, run_id: runId });
      } catch (error) { results.push({ trigger_id: trigger.id, skipped: error instanceof Error ? error.message : "dispatch failed" }); }
    }
    res.status(200).json({ ok: true, quota_windows_reset: quotaWindowsReset, dispatched: results });
  } catch (error) { sendError(res, error); }
}
