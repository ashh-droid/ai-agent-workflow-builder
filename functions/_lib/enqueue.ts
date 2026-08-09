import { randomUUID } from "node:crypto";
import { adminGraphql } from "./admin";
import { reserveQuota } from "./quota";
import type { StepType, TriggerType } from "./types";

interface WorkflowForRun {
  id: string;
  org_id: string;
  is_active: boolean;
  steps: Array<{
    id: string;
    step_order: number;
    step_type: StepType;
    name: string;
    config: Record<string, unknown>;
  }>;
}

export async function getWorkflowForRun(workflowId: string): Promise<WorkflowForRun | null> {
  const data = await adminGraphql<{ workflows_by_pk: WorkflowForRun | null }>(
    `query WorkflowForRun($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        id org_id is_active
        steps(order_by: {step_order: asc}) { id step_order step_type name config }
      }
    }`,
    { workflowId },
  );
  return data.workflows_by_pk;
}

export async function hasActiveTrigger(workflowId: string, triggerType: TriggerType): Promise<boolean> {
  const data = await adminGraphql<{ workflow_triggers_aggregate: { aggregate: { count: number } | null } }>(
    `query TriggerCount($workflowId: uuid!, $type: String!) {
      workflow_triggers_aggregate(where: {
        workflow_id: {_eq: $workflowId}, trigger_type: {_eq: $type}, is_active: {_eq: true}
      }) { aggregate { count } }
    }`,
    { workflowId, type: triggerType },
  );
  return (data.workflow_triggers_aggregate.aggregate?.count ?? 0) > 0;
}

export async function enqueueWorkflow(
  workflowId: string,
  triggerType: TriggerType,
  payload: unknown,
  triggeredBy: string | null,
): Promise<string> {
  const workflow = await getWorkflowForRun(workflowId);
  if (!workflow?.is_active) throw new Error("Workflow not found or inactive");
  if (!workflow.steps.length) throw new Error("Workflow has no executable steps");

  await reserveQuota(workflow.org_id);
  const runId = randomUUID();
  const run = {
    id: runId,
    workflow_id: workflow.id,
    org_id: workflow.org_id,
    status: "pending",
    trigger_type: triggerType,
    triggered_by: triggeredBy,
    trigger_payload: payload ?? {},
    next_step_order: workflow.steps[0].step_order,
    quota_reserved: true,
  };
  const stepRuns = workflow.steps.map((step) => ({
    id: randomUUID(),
    workflow_run_id: runId,
    workflow_step_id: step.id,
    org_id: workflow.org_id,
    step_order: step.step_order,
    step_type: step.step_type,
    step_name: step.name,
    step_config: step.config ?? {},
    status: "pending",
    attempt_count: 0,
  }));

  try {
    await adminGraphql(
      `mutation EnqueueRun($run: workflow_runs_insert_input!, $steps: [step_runs_insert_input!]!) {
        insert_workflow_runs_one(object: $run) { id }
        insert_step_runs(objects: $steps) { affected_rows }
      }`,
      { run, steps: stepRuns },
    );
  } catch (error) {
    await adminGraphql(
      `mutation UndoReservation($orgId: uuid!) {
        update_organizations_by_pk(pk_columns: {id: $orgId}, _inc: {quota_remaining: 1}) { id }
      }`,
      { orgId: workflow.org_id },
    ).catch(() => undefined);
    throw error;
  }
  return runId;
}
