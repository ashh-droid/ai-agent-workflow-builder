import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { adminGraphql } from "./_lib/admin";
import { actionUserId, requireMembership, requireNhostWebhook, sendError, sha256 } from "./_lib/security";
import type { ActionEnvelope, OrgRole, WorkflowDraft, WorkflowStepDraft, WorkflowTriggerDraft } from "./_lib/types";

const restrictedSteps = new Set(["db_write", "notify"]);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function validateDraft(draft: WorkflowDraft): void {
  if (!draft.org_id || !draft.name?.trim()) throw new Error("Organization and workflow name are required");
  if (!Array.isArray(draft.steps) || draft.steps.length < 1 || draft.steps.length > 30) throw new Error("A workflow must contain 1-30 steps");
  const orders = draft.steps.map((step) => step.step_order).sort((a, b) => a - b);
  if (orders.some((order, index) => order !== index + 1)) throw new Error("Step order must be contiguous starting at 1");
  if (new Set(draft.triggers.map((trigger) => trigger.trigger_type)).size !== draft.triggers.length) throw new Error("Only one trigger of each type is supported");
  for (const step of draft.steps) {
    if (!step.name?.trim()) throw new Error("Every step needs a name");
    if (step.step_type === "conditional_branch") {
      const t = Number(step.config?.true_step_order), f = Number(step.config?.false_step_order);
      if (!Number.isInteger(t) || !Number.isInteger(f) || t <= step.step_order || f <= step.step_order || !orders.includes(t) || !orders.includes(f)) throw new Error("Conditional branches must target existing forward steps");
    }
  }
}
interface ExistingWorkflow { id: string; org_id: string; steps: WorkflowStepDraft[]; triggers: Array<WorkflowTriggerDraft & { secret_hash?: string | null }>; }
async function fetchExisting(id: string): Promise<ExistingWorkflow | null> {
  const data = await adminGraphql<{ workflows_by_pk: ExistingWorkflow | null }>(`query Existing($id: uuid!) { workflows_by_pk(id: $id) { id org_id steps(order_by: {step_order: asc}) { id step_order step_type name config } triggers { id trigger_type config is_active secret_hash } } }`, { id });
  return data.workflows_by_pk;
}
function enforceEditorRestrictions(role: OrgRole, draft: WorkflowDraft, existing: ExistingWorkflow | null): void {
  if (role === "owner") return;
  const oldSteps = new Map((existing?.steps ?? []).filter((s) => restrictedSteps.has(s.step_type)).map((s) => [s.id, s]));
  const oldHooks = new Map((existing?.triggers ?? []).filter((t) => t.trigger_type === "webhook").map((t) => [t.id, t]));
  for (const step of draft.steps) {
    if (!restrictedSteps.has(step.step_type)) continue;
    const previous = step.id ? oldSteps.get(step.id) : undefined;
    if (!previous || canonical({ step_order: previous.step_order, step_type: previous.step_type, name: previous.name, config: previous.config }) !== canonical({ step_order: step.step_order, step_type: step.step_type, name: step.name, config: step.config ?? {} })) throw new Error(`Only owners can add or modify ${step.step_type} steps`);
    oldSteps.delete(step.id);
  }
  if (oldSteps.size) throw new Error("Only owners can remove db_write or notify steps");
  for (const trigger of draft.triggers) {
    if (trigger.trigger_type !== "webhook") continue;
    const previous = trigger.id ? oldHooks.get(trigger.id) : undefined;
    const cleanConfig = { ...(trigger.config ?? {}) }; delete cleanConfig.secret;
    if (!previous || canonical({ trigger_type: previous.trigger_type, is_active: previous.is_active, config: previous.config }) !== canonical({ trigger_type: trigger.trigger_type, is_active: trigger.is_active ?? true, config: cleanConfig })) throw new Error("Only owners can add or modify webhook triggers");
    oldHooks.delete(trigger.id);
  }
  if (oldHooks.size) throw new Error("Only owners can remove webhook triggers");
}
export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const envelope = req.body as ActionEnvelope<{ payload: WorkflowDraft }>;
    const userId = actionUserId(envelope.session_variables);
    const draft = envelope.input.payload;
    validateDraft(draft);
    const existing = draft.id ? await fetchExisting(draft.id) : null;
    if (draft.id && (!existing || existing.org_id !== draft.org_id)) throw new Error("Not found or not authorized");
    const role = await requireMembership(userId, draft.org_id, ["owner", "editor"]);
    enforceEditorRestrictions(role, draft, existing);
    const workflowId = draft.id ?? randomUUID();
    const existingTriggers = new Map((existing?.triggers ?? []).map((trigger) => [trigger.id, trigger]));
    const steps = draft.steps.map((step) => ({ id: step.id ?? randomUUID(), workflow_id: workflowId, org_id: draft.org_id, step_order: step.step_order, step_type: step.step_type, name: step.name.trim(), config: step.config ?? {} }));
    const triggers = draft.triggers.map((trigger) => {
      const id = trigger.id ?? randomUUID();
      const config = { ...(trigger.config ?? {}) };
      const secret = typeof config.secret === "string" ? config.secret : undefined; delete config.secret;
      let secretHash: string | null = null;
      if (trigger.trigger_type === "webhook") {
        if (secret && secret.length < 12) throw new Error("Webhook secrets must be at least 12 characters");
        secretHash = secret ? sha256(secret) : existingTriggers.get(trigger.id)?.secret_hash ?? null;
        if (!secretHash) throw new Error("A webhook secret is required when creating a webhook trigger");
      }
      return { id, workflow_id: workflowId, org_id: draft.org_id, trigger_type: trigger.trigger_type, config, secret_hash: secretHash, is_active: trigger.is_active ?? true };
    });
    await adminGraphql(`mutation SaveWorkflow($workflow: workflows_insert_input!, $workflowId: uuid!, $steps: [workflow_steps_insert_input!]!, $triggers: [workflow_triggers_insert_input!]!) { insert_workflows_one(object: $workflow, on_conflict: {constraint: workflows_pkey, update_columns: [name, description, is_active]}) { id } delete_workflow_steps(where: {workflow_id: {_eq: $workflowId}}) { affected_rows } delete_workflow_triggers(where: {workflow_id: {_eq: $workflowId}}) { affected_rows } insert_workflow_steps(objects: $steps) { affected_rows } insert_workflow_triggers(objects: $triggers) { affected_rows } }`, { workflowId, workflow: { id: workflowId, org_id: draft.org_id, name: draft.name.trim(), description: draft.description?.trim() || null, is_active: draft.is_active ?? true, created_by: userId }, steps, triggers });
    res.status(200).json({ workflow_id: workflowId, success: true, message: "Workflow saved" });
  } catch (error) { sendError(res, error); }
}
