import type { Request, Response } from "express";
import { adminGraphql } from "../_lib/admin";
import { assertSafeExternalUrl, requireNhostWebhook, sendError } from "../_lib/security";

interface NotificationRow { id: string; channel: "slack" | "email" | "demo"; destination: string | null; payload: { message?: string } & Record<string, unknown>; status: string; }
interface HasuraEvent<T> { event?: { data?: { new?: T } } }
async function deliver(row: NotificationRow): Promise<void> {
  const message = typeof row.payload?.message === "string" ? row.payload.message : JSON.stringify(row.payload ?? {});
  if (row.channel === "demo") return;
  if (row.channel === "slack") {
    const raw = row.destination || process.env.SLACK_WEBHOOK_URL;
    if (!raw) throw new Error("No Slack webhook destination configured");
    const url = await assertSafeExternalUrl(raw);
    if (url.hostname !== "hooks.slack.com") throw new Error("Slack notifications only allow hooks.slack.com destinations");
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: message }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Slack delivery failed (${response.status})`);
    return;
  }
  const endpoint = process.env.NOTIFY_EMAIL_ENDPOINT;
  if (!endpoint) throw new Error("NOTIFY_EMAIL_ENDPOINT is not configured");
  const url = await assertSafeExternalUrl(endpoint);
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: row.destination, subject: "Workflow notification", text: message }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
}
export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const row = (req.body as HasuraEvent<NotificationRow>).event?.data?.new;
    if (!row?.id) throw new Error("Malformed notification event");
    const fresh = await adminGraphql<{ notifications_by_pk: NotificationRow | null }>(`query Notification($id: uuid!) { notifications_by_pk(id: $id) { id channel destination payload status } }`, { id: row.id });
    if (!fresh.notifications_by_pk || fresh.notifications_by_pk.status === "delivered") { res.status(200).json({ ok: true, skipped: true }); return; }
    try {
      await deliver(fresh.notifications_by_pk);
      await adminGraphql(`mutation Delivered($id: uuid!, $at: timestamptz!) { update_notifications_by_pk(pk_columns: {id: $id}, _set: {status: "delivered", delivered_at: $at, error: null}) { id } }`, { id: row.id, at: new Date().toISOString() });
      res.status(200).json({ ok: true, delivered: true });
    } catch (error) {
      await adminGraphql(`mutation Failed($id: uuid!, $error: String!) { update_notifications_by_pk(pk_columns: {id: $id}, _set: {status: "failed", error: $error}) { id } }`, { id: row.id, error: error instanceof Error ? error.message : "delivery failed" }).catch(() => undefined);
      throw error;
    }
  } catch (error) { sendError(res, error); }
}
