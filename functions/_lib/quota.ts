import { adminGraphql } from "./admin";

export async function reserveQuota(orgId: string): Promise<void> {
  const data = await adminGraphql<{ update_organizations: { affected_rows: number } }>(
    `mutation ReserveQuota($orgId: uuid!) {
      update_organizations(
        where: {id: {_eq: $orgId}, quota_remaining: {_gt: 0}},
        _inc: {quota_remaining: -1}
      ) { affected_rows }
    }`,
    { orgId },
  );
  if (data.update_organizations.affected_rows !== 1) {
    const error = new Error("Organization quota exhausted");
    (error as Error & { status?: number }).status = 429;
    throw error;
  }
}

export async function markRunTerminal(runId: string, status: "completed" | "failed" | "cancelled"): Promise<void> {
  await adminGraphql(
    `mutation MarkTerminal($runId: uuid!, $status: String!, $completedAt: timestamptz!) {
      update_workflow_runs_by_pk(
        pk_columns: {id: $runId},
        _set: {status: $status, completed_at: $completedAt}
      ) { id status quota_reserved }
    }`,
    { runId, status, completedAt: new Date().toISOString() },
  );
}
