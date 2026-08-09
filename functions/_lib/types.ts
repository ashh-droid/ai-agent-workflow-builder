export type OrgRole = "owner" | "editor" | "viewer";
export type StepType =
  | "llm_call"
  | "http_request"
  | "db_write"
  | "notify"
  | "conditional_branch"
  | "approval_gate";
export type TriggerType = "manual" | "webhook" | "scheduled" | "db_event";
export type RunStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface ActionEnvelope<T> {
  action?: { name?: string };
  input: T;
  session_variables?: Record<string, string>;
}

export interface WorkflowStepDraft {
  id?: string;
  step_order: number;
  step_type: StepType;
  name: string;
  config?: Record<string, unknown>;
}

export interface WorkflowTriggerDraft {
  id?: string;
  trigger_type: TriggerType;
  is_active?: boolean;
  config?: Record<string, unknown> & { secret?: string };
}

export interface WorkflowDraft {
  id?: string;
  org_id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  steps: WorkflowStepDraft[];
  triggers: WorkflowTriggerDraft[];
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string | null;
  org_id: string;
  step_order: number;
  step_type: StepType;
  step_name: string;
  step_config: Record<string, unknown>;
  status: string;
  input: unknown;
  output: unknown;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
}
