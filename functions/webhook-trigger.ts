import type { Request, Response } from "express";
import { adminGraphql } from "./_lib/admin";
import { enqueueWorkflow } from "./_lib/enqueue";
import { assertWebhookSecret, requireNhostWebhook, sendError } from "./_lib/security";
import type { ActionEnvelope } from "./_lib/types";

export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const envelope = req.body as ActionEnvelope<{ workflow_id: string; secret: string; payload?: unknown }>;
    const data = await adminGraphql<{ workflow_triggers: Array<{ secret_hash: string | null }> }>(
      `query WebhookTrigger($workflowId: uuid!) { workflow_triggers(where: {workflow_id: {_eq: $workflowId}, trigger_type: {_eq: "webhook"}, is_active: {_eq: true}}, limit: 1) { secret_hash } }`,
      { workflowId: envelope.input.workflow_id },
    );
    assertWebhookSecret(envelope.input.secret ?? "", data.workflow_triggers[0]?.secret_hash);
    const runId = await enqueueWorkflow(envelope.input.workflow_id, "webhook", envelope.input.payload ?? {}, null);
    res.status(200).json({ run_id: runId, status: "pending", message: "Webhook run queued" });
  } catch (error) { sendError(res, error); }
}
