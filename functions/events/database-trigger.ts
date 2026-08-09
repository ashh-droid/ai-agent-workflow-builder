import type { Request, Response } from "express";
import { adminGraphql } from "../_lib/admin";
import { enqueueWorkflow } from "../_lib/enqueue";
import { requireNhostWebhook, sendError } from "../_lib/security";

interface TriggerEventRow { id: string; org_id: string; event_name: string; payload: unknown; }
interface HasuraEvent<T> { event?: { data?: { new?: T } } }
export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const row = (req.body as HasuraEvent<TriggerEventRow>).event?.data?.new;
    if (!row?.id || !row.org_id || !row.event_name) throw new Error("Malformed database event");
    const data = await adminGraphql<{ workflow_triggers: Array<{ id: string; workflow_id: string; workflow: { is_active: boolean } | null }> }>(
      `query DbEventTriggers($orgId: uuid!, $contains: jsonb!) { workflow_triggers(where: {org_id: {_eq: $orgId}, trigger_type: {_eq: "db_event"}, is_active: {_eq: true}, config: {_contains: $contains}}) { id workflow_id workflow { is_active } } }`,
      { orgId: row.org_id, contains: { event_name: row.event_name } },
    );
    const dispatched = [];
    for (const trigger of data.workflow_triggers) {
      if (!trigger.workflow?.is_active) continue;
      try {
        const runId = await enqueueWorkflow(trigger.workflow_id, "db_event", { event_id: row.id, event_name: row.event_name, payload: row.payload }, null);
        dispatched.push({ trigger_id: trigger.id, run_id: runId });
      } catch (error) { dispatched.push({ trigger_id: trigger.id, error: error instanceof Error ? error.message : "dispatch failed" }); }
    }
    res.status(200).json({ ok: true, dispatched });
  } catch (error) { sendError(res, error); }
}
