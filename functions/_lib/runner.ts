import { adminGraphql } from "./admin";
import { markRunTerminal } from "./quota";
import { assertSafeExternalUrl } from "./security";
import { getByPath, renderJsonTemplate, renderTemplate, type TemplateContext } from "./templates";
import type { StepRun } from "./types";

interface RunRecord {
  id: string;
  workflow_id: string;
  org_id: string;
  status: string;
  trigger_payload: unknown;
  next_step_order: number;
  started_at: string | null;
  step_runs: StepRun[];
}

async function fetchRun(runId: string): Promise<RunRecord | null> {
  const data = await adminGraphql<{ workflow_runs_by_pk: RunRecord | null }>(
    `query Run($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        id workflow_id org_id status trigger_payload next_step_order started_at
        step_runs(order_by: {step_order: asc}) {
          id workflow_run_id workflow_step_id org_id step_order step_type step_name step_config
          status input output attempt_count approved_by approved_at
        }
      }
    }`,
    { runId },
  );
  return data.workflow_runs_by_pk;
}

async function updateRun(runId: string, set: Record<string, unknown>): Promise<void> {
  await adminGraphql(
    `mutation UpdateRun($runId: uuid!, $set: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: {id: $runId}, _set: $set) { id status next_step_order }
    }`,
    { runId, set },
  );
}

async function updateStep(stepRunId: string, set: Record<string, unknown>): Promise<void> {
  await adminGraphql(
    `mutation UpdateStep($id: uuid!, $set: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: {id: $id}, _set: $set) { id status attempt_count }
    }`,
    { id: stepRunId, set },
  );
}

async function skipUntil(runId: string, afterOrder: number, targetOrder: number): Promise<void> {
  if (targetOrder <= afterOrder + 1) return;
  await adminGraphql(
    `mutation SkipBranch($runId: uuid!, $after: Int!, $target: Int!, $completedAt: timestamptz!) {
      update_step_runs(
        where: {
          workflow_run_id: {_eq: $runId},
          step_order: {_gt: $after, _lt: $target},
          status: {_eq: "pending"}
        },
        _set: {status: "skipped", completed_at: $completedAt}
      ) { affected_rows }
    }`,
    { runId, after: afterOrder, target: targetOrder, completedAt: new Date().toISOString() },
  );
}

function previousOutput(run: RunRecord, currentOrder: number): unknown {
  const previous = [...run.step_runs]
    .filter((step) => step.step_order < currentOrder && ["completed", "approved"].includes(step.status))
    .sort((a, b) => b.step_order - a.step_order)[0];
  return previous?.output ?? run.trigger_payload ?? null;
}

function contextFor(run: RunRecord, previous: unknown): TemplateContext {
  return { input: run.trigger_payload ?? null, prev_output: previous, run_id: run.id, org_id: run.org_id };
}

async function executeGemini(config: Record<string, unknown>, context: TemplateContext): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = typeof config.model === "string" ? config.model : "gemini-2.5-flash";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Invalid Gemini model name");
  const prompt = renderTemplate(typeof config.prompt_template === "string" ? config.prompt_template : "{{prev_output}}", context);
  const jsonMode = config.json_mode !== false;
  const generationConfig: Record<string, unknown> = {
    temperature: typeof config.temperature === "number" ? config.temperature : 0.2,
    maxOutputTokens: typeof config.max_tokens === "number" ? config.max_tokens : 512,
  };
  if (jsonMode) generationConfig.responseMimeType = "application/json";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig }), signal: AbortSignal.timeout(15_000) },
  );
  const body = (await response.json()) as Record<string, any>;
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${body?.error?.message ?? "request failed"}`);
  const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no text output");
  if (!jsonMode) return { text, model, usage: body.usageMetadata ?? null };
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? { ...parsed, _model: model } : { value: parsed, _model: model };
  } catch {
    throw new Error("Gemini was configured for JSON mode but returned invalid JSON");
  }
}

async function executeHttp(config: Record<string, unknown>, context: TemplateContext): Promise<unknown> {
  if (typeof config.url !== "string") throw new Error("http_request requires config.url");
  const url = await assertSafeExternalUrl(renderTemplate(config.url, context));
  const method = typeof config.method === "string" ? config.method.toUpperCase() : "GET";
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) throw new Error("Unsupported HTTP method");
  const configuredHeaders = (config.headers && typeof config.headers === "object" ? config.headers : {}) as Record<string, unknown>;
  const headers = Object.fromEntries(Object.entries(configuredHeaders).map(([key, value]) => [key, renderTemplate(String(value), context)]));
  const bodyValue = config.body_template ?? config.body;
  const body = ["GET", "HEAD"].includes(method) || bodyValue === undefined ? undefined : JSON.stringify(renderJsonTemplate(bodyValue, context));
  if (body && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
  const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(10_000), redirect: "error" });
  const text = (await response.text()).slice(0, 20_000);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  let data: unknown = text;
  if (response.headers.get("content-type")?.includes("application/json")) { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: response.status, data };
}

async function executeDbWrite(step: StepRun, run: RunRecord, previous: unknown, context: TemplateContext): Promise<unknown> {
  const config = step.step_config ?? {};
  const data = config.data !== undefined ? renderJsonTemplate(config.data, context) : previous;
  const resultKey = typeof config.result_key === "string" ? config.result_key : "result";
  const inserted = await adminGraphql<{ insert_workflow_results_one: { id: string; data: unknown } }>(
    `mutation SaveResult($object: workflow_results_insert_input!) { insert_workflow_results_one(object: $object) { id data } }`,
    { object: { org_id: run.org_id, workflow_id: run.workflow_id, workflow_run_id: run.id, step_run_id: step.id, result_key: resultKey, data: data ?? { value: null } } },
  );
  return { saved: true, result_id: inserted.insert_workflow_results_one.id, data: inserted.insert_workflow_results_one.data };
}

async function executeNotify(step: StepRun, run: RunRecord, previous: unknown, context: TemplateContext): Promise<unknown> {
  const config = step.step_config ?? {};
  const channel = ["slack", "email", "demo"].includes(String(config.channel)) ? String(config.channel) : "demo";
  const message = renderTemplate(typeof config.message_template === "string" ? config.message_template : "Workflow {{run_id}} reached a notify step.", context);
  const data = await adminGraphql<{ insert_notifications_one: { id: string } }>(
    `mutation QueueNotification($object: notifications_insert_input!) { insert_notifications_one(object: $object) { id } }`,
    { object: { org_id: run.org_id, workflow_run_id: run.id, step_run_id: step.id, channel, destination: typeof config.destination === "string" ? config.destination : null, payload: { message, previous_output: previous }, status: "pending" } },
  );
  return { queued: true, notification_id: data.insert_notifications_one.id, previous_output: previous };
}

function evaluateBranch(config: Record<string, unknown>, previous: unknown): number {
  const path = typeof config.path === "string" ? config.path : "sentiment";
  const operator = typeof config.operator === "string" ? config.operator : "equals";
  const expected = config.value ?? "positive";
  const actual = getByPath(previous, path);
  let result = false;
  if (operator === "equals") result = String(actual).toLowerCase() === String(expected).toLowerCase();
  else if (operator === "contains") result = String(actual).toLowerCase().includes(String(expected).toLowerCase());
  else if (operator === "truthy") result = Boolean(actual);
  else throw new Error(`Unsupported branch operator: ${operator}`);
  const target = Number(result ? config.true_step_order : config.false_step_order);
  if (!Number.isInteger(target) || target <= 0) throw new Error("conditional_branch requires valid true_step_order/false_step_order");
  return target;
}

async function withRetry(step: StepRun, task: () => Promise<unknown>): Promise<unknown> {
  const maxAttempts = ["llm_call", "http_request"].includes(step.step_type) ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await updateStep(step.id, { attempt_count: attempt, error: null });
    try { return await task(); } catch (error) {
      lastError = error;
      await updateStep(step.id, { error: error instanceof Error ? error.message : "Unknown step error" });
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Step failed");
}

export async function executeRun(runId: string): Promise<{ status: string }> {
  const run = await fetchRun(runId);
  if (!run) throw new Error("Run not found");
  if (["completed", "failed", "cancelled"].includes(run.status)) return { status: run.status };
  if (run.status === "paused") return { status: "paused" };
  const now = new Date().toISOString();
  await updateRun(run.id, { status: "running", started_at: run.started_at ?? now });
  run.status = "running";
  try {
    for (const step of run.step_runs) {
      if (step.step_order < run.next_step_order || step.status !== "pending") continue;
      const previous = previousOutput(run, step.step_order);
      const context = contextFor(run, previous);
      await updateStep(step.id, { status: "running", input: previous ?? null, started_at: new Date().toISOString(), error: null });
      step.status = "running";
      step.input = previous;
      if (step.step_type === "approval_gate") {
        await updateStep(step.id, { status: "waiting_approval", output: previous ?? null, attempt_count: 1 });
        step.status = "waiting_approval";
        step.output = previous;
        await updateRun(run.id, { status: "paused", next_step_order: step.step_order + 1 });
        return { status: "paused" };
      }
      let output: unknown;
      if (step.step_type === "llm_call") output = await withRetry(step, () => executeGemini(step.step_config ?? {}, context));
      else if (step.step_type === "http_request") output = await withRetry(step, () => executeHttp(step.step_config ?? {}, context));
      else if (step.step_type === "db_write") output = await withRetry(step, () => executeDbWrite(step, run, previous, context));
      else if (step.step_type === "notify") output = await withRetry(step, () => executeNotify(step, run, previous, context));
      else if (step.step_type === "conditional_branch") {
        const target = evaluateBranch(step.step_config ?? {}, previous);
        if (target <= step.step_order) throw new Error("conditional_branch targets must point forward");
        if (!run.step_runs.some((candidate) => candidate.step_order === target)) throw new Error(`conditional_branch target ${target} does not exist`);
        await skipUntil(run.id, step.step_order, target);
        run.step_runs.forEach((candidate) => { if (candidate.step_order > step.step_order && candidate.step_order < target && candidate.status === "pending") candidate.status = "skipped"; });
        output = previous && typeof previous === "object" ? { ...(previous as Record<string, unknown>), _branch_target: target } : { value: previous, _branch_target: target };
        await updateRun(run.id, { next_step_order: target });
        run.next_step_order = target;
      } else throw new Error(`Unsupported step type: ${step.step_type}`);
      await updateStep(step.id, { status: "completed", output: output ?? null, completed_at: new Date().toISOString(), attempt_count: Math.max(step.attempt_count || 0, 1) });
      step.status = "completed";
      step.output = output;
      if (step.step_type !== "conditional_branch") {
        run.next_step_order = step.step_order + 1;
        await updateRun(run.id, { next_step_order: run.next_step_order });
      }
    }
    await markRunTerminal(run.id, "completed");
    return { status: "completed" };
  } catch (error) {
    const active = run.step_runs.find((step) => step.status === "running");
    if (active) await updateStep(active.id, { status: "failed", error: error instanceof Error ? error.message : "Unknown execution failure", completed_at: new Date().toISOString() }).catch(() => undefined);
    await markRunTerminal(run.id, "failed");
    throw error;
  }
}
