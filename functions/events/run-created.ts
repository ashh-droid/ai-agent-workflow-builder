import type { Request, Response } from "express";
import { executeRun } from "../_lib/runner";
import { requireNhostWebhook, sendError } from "../_lib/security";

interface HasuraEvent<T> { event?: { data?: { new?: T } } }

export default async function handler(req: Request, res: Response) {
  try {
    requireNhostWebhook(req);
    const row = (req.body as HasuraEvent<{ id: string; status: string }>).event?.data?.new;
    if (!row?.id) throw new Error("Malformed workflow_run event");
    const result = await executeRun(row.id);
    res.status(200).json({ ok: true, run_id: row.id, status: result.status });
  } catch (error) { sendError(res, error); }
}
