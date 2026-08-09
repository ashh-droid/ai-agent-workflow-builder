import type { Request, Response } from "express";
import { enqueueWorkflow, getWorkflowForRun, hasActiveTrigger } from "./_lib/enqueue";
import { actionUserId, requireMembership, requireNhostWebhook, sendError } from "./_lib/security";
import type { ActionEnvelope } from "./_lib/types";

export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const envelope = req.body as ActionEnvelope<{ workflow_id: string; input?: unknown }>;
    const userId = actionUserId(envelope.session_variables);
    const workflow = await getWorkflowForRun(envelope.input.workflow_id);
    if (!workflow) throw new Error("Not found or not authorized");
    await requireMembership(userId, workflow.org_id, ["owner", "editor"]);
    if (!(await hasActiveTrigger(workflow.id, "manual"))) throw new Error("This workflow has no active manual trigger");
    const runId = await enqueueWorkflow(workflow.id, "manual", envelope.input.input ?? {}, userId);
    res.status(200).json({ run_id: runId, status: "pending", message: "Run queued" });
  } catch (error) { sendError(res, error); }
}
