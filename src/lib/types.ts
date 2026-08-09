export type OrgRole = "owner" | "editor" | "viewer";
export type StepType = "llm_call" | "http_request" | "db_write" | "notify" | "conditional_branch" | "approval_gate";
export type TriggerType = "manual" | "webhook" | "scheduled" | "db_event";
export interface Organization { id: string; name: string; quota_limit: number; quota_used: number; quota_remaining: number; quota_reset_at: string; }
export interface Membership { role: OrgRole; organization: Organization; }
export interface WorkflowStep { id?: string; workflow_id?: string; org_id?: string; step_order: number; step_type: StepType; name: string; config: Record<string, any>; }
export interface WorkflowTrigger { id?: string; workflow_id?: string; org_id?: string; trigger_type: TriggerType; config: Record<string, any>; is_active: boolean; last_fired_at?: string | null; }
export interface Workflow { id?: string; org_id: string; name: string; description?: string | null; is_active: boolean; steps: WorkflowStep[]; triggers: WorkflowTrigger[]; runs?: Array<{ id: string; status: string; trigger_type: string; created_at: string }>; }
export interface StepRun { id: string; workflow_run_id: string; step_order: number; step_type: StepType; step_name: string; status: string; input: unknown; output: unknown; error?: string | null; attempt_count: number; approved_by?: string | null; approved_at?: string | null; started_at?: string | null; completed_at?: string | null; }
