import { adminGraphql } from "./admin";

interface ExpiredOrganization {
  id: string;
  quota_limit: number;
  quota_used: number;
  quota_remaining: number;
  quota_reset_at: string;
}

function nextUtcMonthBoundary(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Reset expired monthly quota windows only when the organization has no
 * in-flight reservations. Skipping organizations with reservations keeps the
 * `quota_used + quota_remaining + reserved = quota_limit` invariant intact.
 * The next cron tick will retry the reset after those runs settle.
 */
export async function resetExpiredQuotas(now = new Date()): Promise<number> {
  const data = await adminGraphql<{ organizations: ExpiredOrganization[] }>(
    `query ExpiredQuotaWindows($now: timestamptz!) {
      organizations(where: {quota_reset_at: {_lte: $now}}) {
        id quota_limit quota_used quota_remaining quota_reset_at
      }
    }`,
    { now: now.toISOString() },
  );

  let resetCount = 0;
  for (const org of data.organizations) {
    const reserved = org.quota_limit - org.quota_used - org.quota_remaining;
    if (reserved !== 0) continue;

    const result = await adminGraphql<{
      update_organizations: { affected_rows: number };
    }>(
      `mutation ResetQuotaWindow(
        $id: uuid!, $expiredAt: timestamptz!, $remaining: Int!, $nextReset: timestamptz!
      ) {
        update_organizations(
          where: {id: {_eq: $id}, quota_reset_at: {_eq: $expiredAt}}
          _set: {quota_used: 0, quota_remaining: $remaining, quota_reset_at: $nextReset}
        ) { affected_rows }
      }`,
      {
        id: org.id,
        expiredAt: org.quota_reset_at,
        remaining: org.quota_limit,
        nextReset: nextUtcMonthBoundary(now),
      },
    );
    resetCount += result.update_organizations.affected_rows;
  }

  return resetCount;
}
