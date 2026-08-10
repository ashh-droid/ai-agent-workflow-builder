"use client";

import { ArrowDown, ArrowUp, Braces, Database, DatabaseZap, LockKeyhole, Plus, Save, Settings2, Trash2, Webhook, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { OrgRole, StepType, Workflow, WorkflowStep, TriggerType } from "@/lib/types";

const restricted = new Set<StepType>(["db_write", "notify"]);
const stepTypes: Array<{ type: StepType; label: string; short: string }> = [
  { type: "llm_call", label: "LLM call", short: "LLM" },
  { type: "http_request", label: "HTTP request", short: "HTTP" },
  { type: "conditional_branch", label: "Conditional branch", short: "IF" },
  { type: "approval_gate", label: "Approval gate", short: "GATE" },
  { type: "db_write", label: "DB write", short: "DB" },
  { type: "notify", label: "Notify", short: "NOTIFY" },
];

function stepMeta(type: StepType) {
  return stepTypes.find((item) => item.type === type) ?? { type, label: type, short: type };
}

function defaultConfig(type: StepType): Record<string, any> {
  if (type === "llm_call") return {
    model: "gemini-3.5-flash-lite",
    prompt_template: "Classify the sentiment of this text: {{input.text}}. Reply with exactly one word: POSITIVE or NEGATIVE.",
    temperature: 0,
    max_tokens: 128,
    json_mode: false,
  };
  if (type === "http_request") return {
    url: "https://httpbin.org/anything",
    method: "POST",
    body_template: {
      sentiment: "{{prev_output.text}}",
      model: "{{prev_output.model}}",
      run_id: "{{run_id}}",
      source: "agentflow-reviewer-demo",
    },
  };
  if (type === "conditional_branch") return {
    path: "text",
    operator: "contains",
    value: "POSITIVE",
    true_step_order: 3,
    false_step_order: 4,
  };
  if (type === "approval_gate") return {
    message: "Review the AI decision and downstream payload before protected persistence.",
    required_role: "owner_or_editor",
  };
  if (type === "db_write") return {
    result_key: "approved_sentiment_demo",
    data: "{{prev_output}}",
  };
  return {
    channel: "demo",
    destination: "reviewer-outbox",
    message_template: "AgentFlow run {{run_id}} completed after human approval.",
  };
}

function reviewerDemo(orgId: string): Workflow {
  return {
    org_id: orgId,
    name: "Customer Sentiment Release Guardrail",
    description: "Gemini classification → conditional route → real HTTP call → human approval → protected DB write → notification.",
    is_active: true,
    steps: [
      { step_order: 1, step_type: "llm_call", name: "Classify sentiment with Gemini", config: defaultConfig("llm_call") },
      { step_order: 2, step_type: "conditional_branch", name: "Route by Gemini output", config: defaultConfig("conditional_branch") },
      { step_order: 3, step_type: "http_request", name: "POST decision payload to external API", config: defaultConfig("http_request") },
      { step_order: 4, step_type: "approval_gate", name: "Human approval checkpoint", config: defaultConfig("approval_gate") },
      { step_order: 5, step_type: "db_write", name: "Persist approved result", config: defaultConfig("db_write") },
      { step_order: 6, step_type: "notify", name: "Publish completion notification", config: defaultConfig("notify") },
    ],
    triggers: [
      { trigger_type: "manual", config: {}, is_active: true },
      { trigger_type: "webhook", config: { secret: "agentflow-reviewer-webhook-2026" }, is_active: true },
    ],
  };
}

function emptyWorkflow(orgId: string): Workflow {
  return {
    org_id: orgId,
    name: "Untitled workflow",
    description: "",
    is_active: true,
    steps: [{ step_order: 1, step_type: "llm_call", name: "AI step", config: defaultConfig("llm_call") }],
    triggers: [{ trigger_type: "manual", config: {}, is_active: true }],
  };
}

export function WorkflowBuilder({
  orgId,
  role,
  workflow,
  onSave,
  onRun,
  onDelete,
  onEmitEvent,
  starting,
}: {
  orgId: string;
  role: OrgRole;
  workflow: Workflow | null;
  onSave: (workflow: Workflow) => Promise<void>;
  onRun: () => Promise<void>;
  onDelete: () => Promise<void>;
  onEmitEvent: () => Promise<void>;
  starting: boolean;
}) {
  const [draft, setDraft] = useState<Workflow>(() => workflow ? structuredClone(workflow) : emptyWorkflow(orgId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDraft(workflow ? structuredClone(workflow) : emptyWorkflow(orgId)), [workflow, orgId]);

  const containsRestricted = draft.steps.some((step) => restricted.has(step.step_type)) || draft.triggers.some((trigger) => trigger.trigger_type === "webhook");
  const canReorder = role === "owner" || !containsRestricted;
  const pathSummary = draft.steps.map((step) => stepMeta(step.step_type).short).join(" → ");

  function patchStep(index: number, patch: Partial<WorkflowStep>) {
    setDraft((current) => ({ ...current, steps: current.steps.map((step, i) => i === index ? { ...step, ...patch } : step) }));
  }
  function patchConfig(index: number, key: string, value: unknown) {
    patchStep(index, { config: { ...draft.steps[index].config, [key]: value } });
  }
  function normalizeOrder(steps: WorkflowStep[]) {
    return steps.map((step, index) => ({ ...step, step_order: index + 1 }));
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length || !canReorder) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setDraft({ ...draft, steps: normalizeOrder(steps) });
  }
  function addStep(type: StepType) {
    if (restricted.has(type) && role !== "owner") return;
    setDraft({ ...draft, steps: [...draft.steps, { step_order: draft.steps.length + 1, step_type: type, name: stepMeta(type).label, config: defaultConfig(type) }] });
  }
  function removeStep(index: number) {
    const step = draft.steps[index];
    if (restricted.has(step.step_type) && role !== "owner") return;
    if (draft.steps.length === 1) return;
    setDraft({ ...draft, steps: normalizeOrder(draft.steps.filter((_, i) => i !== index)) });
  }

  function trigger(type: TriggerType) {
    return draft.triggers.find((item) => item.trigger_type === type);
  }
  function toggleTrigger(type: TriggerType, enabled: boolean) {
    if (type === "webhook" && role !== "owner") return;
    const existing = trigger(type);
    if (enabled && !existing) {
      const config = type === "scheduled"
        ? { cron: "*/5 * * * *" }
        : type === "db_event"
          ? { event_name: "demo.created" }
          : type === "webhook"
            ? { secret: "change-me-strong-secret" }
            : {};
      setDraft({ ...draft, triggers: [...draft.triggers, { trigger_type: type, config, is_active: true }] });
    } else if (!enabled && existing) {
      setDraft({ ...draft, triggers: draft.triggers.filter((item) => item.trigger_type !== type) });
    }
  }
  function patchTrigger(type: TriggerType, configPatch: Record<string, unknown>) {
    setDraft({ ...draft, triggers: draft.triggers.map((item) => item.trigger_type === type ? { ...item, config: { ...item.config, ...configPatch } } : item) });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(draft);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pipeline-builder">
      <div className="workflow-editor-header">
        <div className="workflow-title-edit">
          <input className="workflow-name-input" value={draft.name} disabled={role === "viewer"} onChange={(event) => setDraft({ ...draft, name: event.target.value })} aria-label="Workflow name" />
          <span>{pathSummary}</span>
        </div>

        <div className="workflow-toolbar-actions">
          {role === "owner" && <button className="toolbar-button demo-button" onClick={() => setDraft(reviewerDemo(orgId))}><Zap size={14} />Load best demo</button>}

          <details className="toolbar-menu">
            <summary className="toolbar-button"><Settings2 size={14} />Settings</summary>
            <div className="toolbar-popover settings-popover">
              <label>Status<select value={draft.is_active ? "active" : "inactive"} disabled={role === "viewer"} onChange={(event) => setDraft({ ...draft, is_active: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              <label>Description<textarea value={draft.description ?? ""} disabled={role === "viewer"} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              {workflow?.id && role === "owner" && <button className="danger-text-button" type="button" onClick={() => void onDelete()}><Trash2 size={13} />Delete workflow and run history</button>}
            </div>
          </details>

          <details className="toolbar-menu trigger-menu">
            <summary className="toolbar-button"><Webhook size={14} />Triggers <span className="trigger-count">{draft.triggers.filter((item) => item.is_active).length}</span></summary>
            <div className="toolbar-popover triggers-popover">
              <div className="trigger-grid compact-trigger-grid">
                <TriggerToggle label="Manual" icon={<Zap size={14} />} checked={!!trigger("manual")} disabled={role === "viewer"} onChange={(value) => toggleTrigger("manual", value)} />
                <TriggerToggle label="Webhook" icon={<Webhook size={14} />} checked={!!trigger("webhook")} disabled={role !== "owner"} onChange={(value) => toggleTrigger("webhook", value)} />
                <TriggerToggle label="Scheduled" icon={<Braces size={14} />} checked={!!trigger("scheduled")} disabled={role === "viewer"} onChange={(value) => toggleTrigger("scheduled", value)} />
                <TriggerToggle label="Database event" icon={<Database size={14} />} checked={!!trigger("db_event")} disabled={role === "viewer"} onChange={(value) => toggleTrigger("db_event", value)} />
              </div>
              {trigger("webhook") && role === "owner" && <label>Webhook secret<input type="password" placeholder={trigger("webhook")?.id ? "Leave blank to keep existing secret" : "At least 12 characters"} value={String(trigger("webhook")?.config.secret ?? "")} onChange={(event) => patchTrigger("webhook", { secret: event.target.value })} /></label>}
              {trigger("scheduled") && <label>Cron (UTC)<input value={String(trigger("scheduled")?.config.cron ?? "")} disabled={role === "viewer"} onChange={(event) => patchTrigger("scheduled", { cron: event.target.value })} /></label>}
              {trigger("db_event") && <label>Event name<input value={String(trigger("db_event")?.config.event_name ?? "")} disabled={role === "viewer"} onChange={(event) => patchTrigger("db_event", { event_name: event.target.value })} /></label>}
              {workflow?.id && role !== "viewer" && <button className="toolbar-button emit-event-button" type="button" onClick={() => void onEmitEvent()}><DatabaseZap size={13} />Emit demo DB event</button>}
            </div>
          </details>

          {role !== "viewer" && <button className="toolbar-button" onClick={() => void save()} disabled={saving}><Save size={14} />{saving ? "Saving…" : "Save"}</button>}
          {workflow?.id && role !== "viewer" && <button className="run-workflow-button" onClick={() => void onRun()} disabled={starting}><span>▶</span>{starting ? "Queueing…" : "Run workflow"}</button>}
        </div>
      </div>

      {message && <div className={message === "Saved" ? "success-banner compact-banner" : "error-banner compact-banner"}>{message}</div>}

      <div className="pipeline-step-list">
        {draft.steps.map((step, index) => {
          const meta = stepMeta(step.step_type);
          const disabled = role === "viewer" || (restricted.has(step.step_type) && role !== "owner");
          return (
            <div className="pipeline-row" key={step.id ?? `${step.step_type}-${index}`}>
              <div className="pipeline-rail">
                <div className="pipeline-node" data-type={step.step_type}>{step.step_order}</div>
                {index < draft.steps.length - 1 && <div className="pipeline-connector" data-type={step.step_type} />}
              </div>

              <article className="step-card" data-type={step.step_type}>
                <div className="step-card-header">
                  <div className="step-card-title-group">
                    <span className="step-type-badge" data-type={step.step_type}>{meta.short}</span>
                    <input className="step-name-input" value={step.name} disabled={disabled} onChange={(event) => patchStep(index, { name: event.target.value })} aria-label={`Step ${step.step_order} name`} />
                  </div>
                  <div className="step-card-actions">
                    {step.step_type === "approval_gate" && <span className="step-state-hint gate-hint">pauses run</span>}
                    {restricted.has(step.step_type) && <span className="step-owner-badge"><LockKeyhole size={10} />owner only</span>}
                    {role !== "viewer" && <>
                      <button className="micro-icon-button" aria-label="Move step up" disabled={!canReorder || index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} /></button>
                      <button className="micro-icon-button" aria-label="Move step down" disabled={!canReorder || index === draft.steps.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></button>
                      <button className="micro-icon-button danger" aria-label="Remove step" disabled={draft.steps.length === 1 || (restricted.has(step.step_type) && role !== "owner")} onClick={() => removeStep(index)}><Trash2 size={13} /></button>
                    </>}
                  </div>
                </div>
                <StepConfig step={step} index={index} role={role} total={draft.steps.length} patch={patchConfig} />
              </article>
            </div>
          );
        })}
      </div>

      {role !== "viewer" && <div className="add-step-bar">{stepTypes.map((item) => <button key={item.type} className="add-step-btn" data-type={item.type} disabled={restricted.has(item.type) && role !== "owner"} onClick={() => addStep(item.type)}><Plus size={12} />{item.short}{restricted.has(item.type) && <span>owner</span>}</button>)}</div>}
    </section>
  );
}

function TriggerToggle({ label, icon, checked, disabled, onChange }: { label: string; icon: React.ReactNode; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className={`trigger-toggle ${checked ? "checked" : ""}`}>{icon}<span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function StepConfig({ step, index, role, total, patch }: { step: WorkflowStep; index: number; role: OrgRole; total: number; patch: (index: number, key: string, value: unknown) => void }) {
  const disabled = role === "viewer" || (restricted.has(step.step_type) && role !== "owner");

  if (step.step_type === "llm_call") return <div className="step-config step-config-llm"><div className="step-inline-meta"><span>{String(step.config.model ?? "gemini-3.5-flash-lite")}</span><span>temperature {Number(step.config.temperature ?? 0)}</span></div><label className="compact-field">Prompt<textarea className="step-prompt" disabled={disabled} value={String(step.config.prompt_template ?? "")} onChange={(event) => patch(index, "prompt_template", event.target.value)} /></label><details className="advanced-config"><summary>Model settings</summary><div className="grid-two"><label>Model<input disabled={disabled} value={String(step.config.model ?? "gemini-3.5-flash-lite")} onChange={(event) => patch(index, "model", event.target.value)} /></label><label>Temperature<input disabled={disabled} type="number" min="0" max="2" step="0.1" value={Number(step.config.temperature ?? 0)} onChange={(event) => patch(index, "temperature", Number(event.target.value))} /></label></div></details></div>;

  if (step.step_type === "http_request") return <div className="step-config"><div className="http-inline"><select disabled={disabled} value={String(step.config.method ?? "POST")} onChange={(event) => patch(index, "method", event.target.value)}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => <option key={method}>{method}</option>)}</select><input disabled={disabled} value={String(step.config.url ?? "")} onChange={(event) => patch(index, "url", event.target.value)} /></div><details className="advanced-config"><summary>Body template</summary><label>JSON body<textarea disabled={disabled} value={JSON.stringify(step.config.body_template ?? {}, null, 2)} onChange={(event) => { try { patch(index, "body_template", JSON.parse(event.target.value)); } catch {} }} /></label></details></div>;

  if (step.step_type === "conditional_branch") {
    const trueStep = Number(step.config.true_step_order ?? Math.min(total, step.step_order + 1));
    const falseStep = Number(step.config.false_step_order ?? total);
    const options = Array.from({ length: Math.max(0, total - step.step_order) }, (_, i) => step.step_order + i + 1);
    return <div className="step-config"><div className="branch-pills"><span className="branch-pill positive">{String(step.config.value ?? "POSITIVE")} → step {trueStep}</span><span className="branch-pill negative">otherwise → step {falseStep}</span></div><details className="advanced-config"><summary>Branch settings</summary><div className="grid-four"><label>Output path<input disabled={disabled} value={String(step.config.path ?? "text")} onChange={(event) => patch(index, "path", event.target.value)} /></label><label>Match value<input disabled={disabled} value={String(step.config.value ?? "POSITIVE")} onChange={(event) => patch(index, "value", event.target.value)} /></label><label>True → step<select disabled={disabled} value={trueStep} onChange={(event) => patch(index, "true_step_order", Number(event.target.value))}>{options.map((number) => <option key={number} value={number}>{number}</option>)}</select></label><label>False → step<select disabled={disabled} value={falseStep} onChange={(event) => patch(index, "false_step_order", Number(event.target.value))}>{options.map((number) => <option key={number} value={number}>{number}</option>)}</select></label></div></details></div>;
  }

  if (step.step_type === "approval_gate") return <div className="step-config approval-config"><span>{String(step.config.message ?? "Review before continuing")}</span><select disabled={disabled} value={String(step.config.required_role ?? "owner_or_editor")} onChange={(event) => patch(index, "required_role", event.target.value)}><option value="owner_or_editor">Owner or editor</option><option value="owner">Owner only</option></select></div>;

  if (step.step_type === "db_write") return <div className="step-config db-config"><span>workflow_results</span><label>Result key<input disabled={disabled} value={String(step.config.result_key ?? "result")} onChange={(event) => patch(index, "result_key", event.target.value)} /></label></div>;

  return <div className="step-config notify-config"><div className="grid-two"><label>Channel<select disabled={disabled} value={String(step.config.channel ?? "demo")} onChange={(event) => patch(index, "channel", event.target.value)}><option value="demo">Demo outbox</option><option value="slack">Slack</option><option value="email">Email</option></select></label><label>Destination<input disabled={disabled} value={String(step.config.destination ?? "")} onChange={(event) => patch(index, "destination", event.target.value)} /></label></div><label>Message<input disabled={disabled} value={String(step.config.message_template ?? "")} onChange={(event) => patch(index, "message_template", event.target.value)} /></label></div>;
}
