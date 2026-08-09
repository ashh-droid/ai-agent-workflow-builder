export const MY_ORGS = `
  query MyOrganizations($userId: uuid!) {
    org_members(where: {user_id: {_eq: $userId}}, order_by: {created_at: asc}) {
      role
      organization { id name quota_limit quota_used quota_remaining quota_reset_at }
    }
  }
`;

export const ORG_WORKSPACE = `
  query OrgWorkspace($orgId: uuid!) {
    organizations_by_pk(id: $orgId) { id name quota_limit quota_used quota_remaining quota_reset_at }
    org_monthly_usage(where: {org_id: {_eq: $orgId}}, limit: 1) {
      org_id quota_limit quota_used quota_remaining quota_reserved total_runs_this_month avg_run_duration_seconds successful_runs failed_runs
    }
    workflows(where: {org_id: {_eq: $orgId}}, order_by: {updated_at: desc}) {
      id org_id name description is_active created_by created_at updated_at
      steps(order_by: {step_order: asc}) { id workflow_id org_id step_order step_type name config }
      triggers(order_by: {created_at: asc}) { id workflow_id org_id trigger_type config is_active last_fired_at }
      runs(limit: 1, order_by: {created_at: desc}) { id status trigger_type started_at completed_at created_at }
    }
  }
`;

export const SAVE_WORKFLOW = `mutation SaveWorkflow($payload: json!) { saveWorkflow(payload: $payload) { workflow_id success message } }`;
export const TRIGGER_RUN = `mutation TriggerWorkflowRun($workflowId: uuid!, $input: json) { triggerWorkflowRun(workflow_id: $workflowId, input: $input) { run_id status message } }`;
export const APPROVE_STEP = `mutation ApproveStep($stepRunId: uuid!) { approveStep(step_run_id: $stepRunId) { run_id step_run_id status message } }`;
export const INSERT_TRIGGER_EVENT = `mutation EmitDatabaseEvent($orgId: uuid!, $eventName: String!, $payload: jsonb!) { insert_trigger_events_one(object: {org_id: $orgId, event_name: $eventName, payload: $payload}) { id } }`;
export const STEP_RUNS_SUBSCRIPTION = `subscription WatchStepRuns($runId: uuid!) { step_runs(where: {workflow_run_id: {_eq: $runId}}, order_by: {step_order: asc}) { id workflow_run_id step_order step_type step_name status input output error attempt_count approved_by approved_at started_at completed_at } }`;
