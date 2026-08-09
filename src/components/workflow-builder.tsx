"use client";

import { ArrowDown, ArrowUp, Bot, Braces, Database, Globe2, LockKeyhole, Plus, Save, Send, Trash2, Webhook, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { OrgRole, StepType, Workflow, WorkflowStep, TriggerType } from "@/lib/types";

const restricted = new Set<StepType>(["db_write", "notify"]);
const stepTypes: Array<{ type: StepType; label: string }> = [
  { type: "llm_call", label: "LLM call" },
  { type: "http_request", label: "HTTP request" },
  { type: "conditional_branch", label: "Conditional branch" },
  { type: "approval_gate", label: "Approval gate" },
  { type: "db_write", label: "DB write · owner" },
  { type: "notify", label: "Notify · owner" },
];

function defaultConfig(type: StepType): Record<string, any> {
  if (type === "llm_call") return { model: "gemini-2.5-flash", prompt_template: "Return JSON only with sentiment ('positive' or 'negative') and explanation for: {{input.text}}", temperature: 0.2, max_tokens: 300, json_mode: true };
  if (type === "http_request") return { url: "https://httpbin.org/post", method: "POST", body_template: { analysis: "{{prev_output}}" } };
  if (type === "conditional_branch") return { path: "sentiment", operator: "equals", value: "positive", true_step_order: 3, false_step_order: 4 };
  if (type === "approval_gate") return { message: "Review the external-call result before saving", required_role: "owner_or_editor" };
  if (type === "db_write") return { result_key: "approved_analysis", data: "{{prev_output}}" };
  return { channel: "demo", message_template: "Workflow {{run_id}} completed a notify step." };
}

function reviewerDemo(orgId: string): Workflow {
  return {
    org_id: orgId,
    name: "Launch Sentiment Guardrail",
    description: "Gemini sentiment analysis → branch → external API → human approval → persisted result.",
    is_active: true,
    steps: [
      { step_order: 1, step_type: "llm_call", name: "Analyze launch sentiment", config: defaultConfig("llm_call") },
      { step_order: 2, step_type: "conditional_branch", name: "Route by sentiment", config: { path: "sentiment", operator: "equals", value: "positive", true_step_order: 3, false_step_order: 5 } },
      { step_order: 3, step_type: "http_request", name: "Send positive analysis", config: defaultConfig("http_request") },
      { step_order: 4, step_type: "approval_gate", name: "Human approval", config: defaultConfig("approval_gate") },
      { step_order: 5, step_type: "db_write", name: "Persist result", config: defaultConfig("db_write") },
    ],
    triggers: [{ trigger_type: "manual", config: {}, is_active: true }],
  };
}

function emptyWorkflow(orgId: string): Workflow {
  return { org_id: orgId, name: "Untitled workflow", description: "", is_active: true, steps: [{ step_order: 1, step_type: "llm_call", name: "AI step", config: defaultConfig("llm_call") }], triggers: [{ trigger_type: "manual", config: {}, is_active: true }] };
}

export function WorkflowBuilder({ orgId, role, workflow, onSave }: { orgId: string; role: OrgRole; workflow: Workflow | null; onSave: (workflow: Workflow) => Promise<void>; }) {
  const [draft, setDraft] = useState<Workflow>(() => workflow ? structuredClone(workflow) : emptyWorkflow(orgId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDraft(workflow ? structuredClone(workflow) : emptyWorkflow(orgId)), [workflow, orgId]);
  const containsRestricted = draft.steps.some((step) => restricted.has(step.step_type)) || draft.triggers.some((trigger) => trigger.trigger_type === "webhook");
  const canReorder = role === "owner" || !containsRestricted;

  function patchStep(index: number, patch: Partial<WorkflowStep>) { setDraft((current) => ({ ...current, steps: current.steps.map((step, i) => i === index ? { ...step, ...patch } : step) })); }
  function patchConfig(index: number, key: string, value: unknown) { patchStep(index, { config: { ...draft.steps[index].config, [key]: value } }); }
  function normalizeOrder(steps: WorkflowStep[]) { return steps.map((step, index) => ({ ...step, step_order: index + 1 })); }
  function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= draft.steps.length || !canReorder) return; const steps = [...draft.steps]; [steps[index], steps[target]] = [steps[target], steps[index]]; setDraft({ ...draft, steps: normalizeOrder(steps) }); }
  function addStep(type: StepType) { if (restricted.has(type) && role !== "owner") return; setDraft({ ...draft, steps: [...draft.steps, { step_order: draft.steps.length + 1, step_type: type, name: stepTypes.find((item) => item.type === type)?.label ?? type, config: defaultConfig(type) }] }); }
  function removeStep(index: number) { const step = draft.steps[index]; if (restricted.has(step.step_type) && role !== "owner") return; if (draft.steps.length === 1) return; setDraft({ ...draft, steps: normalizeOrder(draft.steps.filter((_, i) => i !== index)) }); }

  function trigger(type: TriggerType) { return draft.triggers.find((item) => item.trigger_type === type); }
  function toggleTrigger(type: TriggerType, enabled: boolean) {
    if (type === "webhook" && role !== "owner") return;
    const existing = trigger(type);
    if (enabled && !existing) {
      const config = type === "scheduled" ? { cron: "*/5 * * * *" } : type === "db_event" ? { event_name: "demo.created" } : type === "webhook" ? { secret: "change-me-strong-secret" } : {};
      setDraft({ ...draft, triggers: [...draft.triggers, { trigger_type: type, config, is_active: true }] });
    } else if (!enabled && existing) setDraft({ ...draft, triggers: draft.triggers.filter((item) => item.trigger_type !== type) });
  }
  function patchTrigger(type: TriggerType, configPatch: Record<string, unknown>) { setDraft({ ...draft, triggers: draft.triggers.map((item) => item.trigger_type === type ? { ...item, config: { ...item.config, ...configPatch } } : item) }); }

  async function save() { setSaving(true); setMessage(null); try { await onSave(draft); setMessage("Saved"); } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); } finally { setSaving(false); } }

  return <section className="builder-panel">
    <div className="section-heading"><div><p className="eyebrow">WORKFLOW BUILDER</p><h2>{draft.id ? "Edit workflow" : "New workflow"}</h2></div><div className="row gap-sm">{role === "owner" && <button className="secondary" onClick={() => setDraft(reviewerDemo(orgId))}><Zap size={15}/>Load reviewer demo</button>}<button className="primary" onClick={save} disabled={saving || role === "viewer"}><Save size={15}/>{saving ? "Saving…" : "Save"}</button></div></div>
    {message && <div className={message === "Saved" ? "success-banner" : "error-banner"}>{message}</div>}
    <div className="builder-meta grid-two"><label>Name<input value={draft.name} disabled={role === "viewer"} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/></label><label>Status<select value={draft.is_active ? "active" : "inactive"} disabled={role === "viewer"} onChange={(e) => setDraft({ ...draft, is_active: e.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="span-two">Description<textarea value={draft.description ?? ""} disabled={role === "viewer"} onChange={(e) => setDraft({ ...draft, description: e.target.value })}/></label></div>
    <div className="trigger-box"><h3>Triggers</h3><div className="trigger-grid"><TriggerToggle label="Manual" icon={<Zap size={15}/>} checked={!!trigger("manual")} disabled={role === "viewer"} onChange={(value) => toggleTrigger("manual", value)}/><TriggerToggle label="Webhook · owner" icon={<Webhook size={15}/>} checked={!!trigger("webhook")} disabled={role !== "owner"} onChange={(value) => toggleTrigger("webhook", value)}/><TriggerToggle label="Scheduled" icon={<Braces size={15}/>} checked={!!trigger("scheduled")} disabled={role === "viewer"} onChange={(value) => toggleTrigger("scheduled", value)}/><TriggerToggle label="Database event" icon={<Database size={15}/>} checked={!!trigger("db_event")} disabled={role === "viewer"} onChange={(value) => toggleTrigger("db_event", value)}/></div>{trigger("webhook") && role === "owner" && <label>Webhook secret<input type="password" placeholder={trigger("webhook")?.id ? "Leave blank to keep existing secret" : "At least 12 characters"} value={String(trigger("webhook")?.config.secret ?? "")} onChange={(e) => patchTrigger("webhook", { secret: e.target.value })}/></label>}{trigger("scheduled") && <label>Cron (UTC)<input value={String(trigger("scheduled")?.config.cron ?? "")} disabled={role === "viewer"} onChange={(e) => patchTrigger("scheduled", { cron: e.target.value })}/></label>}{trigger("db_event") && <label>Event name<input value={String(trigger("db_event")?.config.event_name ?? "")} disabled={role === "viewer"} onChange={(e) => patchTrigger("db_event", { event_name: e.target.value })}/></label>}</div>
    <div className="steps-header"><h3>Steps</h3><span>{draft.steps.length} nodes</span></div><div className="step-list">{draft.steps.map((step,index)=><article className="builder-step" key={step.id ?? `${step.step_type}-${index}`}><div className="step-order">{step.step_order}</div><div className="step-body"><div className="step-toolbar"><div className="step-type"><StepIcon type={step.step_type}/><strong>{step.step_type}</strong>{restricted.has(step.step_type)&&<span className="owner-pill"><LockKeyhole size={12}/>owner</span>}</div><div className="row gap-xs"><button className="icon-btn" disabled={!canReorder||index===0||role==="viewer"} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button><button className="icon-btn" disabled={!canReorder||index===draft.steps.length-1||role==="viewer"} onClick={()=>move(index,1)}><ArrowDown size={15}/></button><button className="icon-btn danger" disabled={draft.steps.length===1||role==="viewer"||(restricted.has(step.step_type)&&role!=="owner")} onClick={()=>removeStep(index)}><Trash2 size={15}/></button></div></div><label>Step name<input value={step.name} disabled={role==="viewer"||(restricted.has(step.step_type)&&role!=="owner")} onChange={(e)=>patchStep(index,{name:e.target.value})}/></label><StepConfig step={step} index={index} role={role} total={draft.steps.length} patch={patchConfig}/></div></article>)}</div>
    {role !== "viewer" && <div className="add-step-row">{stepTypes.map((item)=><button key={item.type} className="chip" disabled={restricted.has(item.type)&&role!=="owner"} onClick={()=>addStep(item.type)}><Plus size={13}/>{item.label}</button>)}</div>}
  </section>;
}

function TriggerToggle({label,icon,checked,disabled,onChange}:{label:string;icon:React.ReactNode;checked:boolean;disabled:boolean;onChange:(value:boolean)=>void}) { return <label className={`trigger-toggle ${checked?"checked":""}`}>{icon}<span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(e)=>onChange(e.target.checked)}/></label>; }
function StepIcon({type}:{type:StepType}) { if(type==="llm_call")return <Bot size={16}/>; if(type==="http_request")return <Globe2 size={16}/>; if(type==="db_write")return <Database size={16}/>; if(type==="notify")return <Send size={16}/>; return <Braces size={16}/>; }
function StepConfig({step,index,role,total,patch}:{step:WorkflowStep;index:number;role:OrgRole;total:number;patch:(index:number,key:string,value:unknown)=>void}) {
  const disabled=role==="viewer"||(restricted.has(step.step_type)&&role!=="owner");
  if(step.step_type==="llm_call")return <div className="grid-two"><label>Model<input disabled={disabled} value={String(step.config.model??"gemini-2.5-flash")} onChange={(e)=>patch(index,"model",e.target.value)}/></label><label>Temperature<input disabled={disabled} type="number" min="0" max="2" step="0.1" value={Number(step.config.temperature??.2)} onChange={(e)=>patch(index,"temperature",Number(e.target.value))}/></label><label className="span-two">Prompt<textarea disabled={disabled} value={String(step.config.prompt_template??"")} onChange={(e)=>patch(index,"prompt_template",e.target.value)}/></label></div>;
  if(step.step_type==="http_request")return <div className="grid-two"><label>Method<select disabled={disabled} value={String(step.config.method??"POST")} onChange={(e)=>patch(index,"method",e.target.value)}>{["GET","POST","PUT","PATCH","DELETE"].map((m)=><option key={m}>{m}</option>)}</select></label><label>URL<input disabled={disabled} value={String(step.config.url??"")} onChange={(e)=>patch(index,"url",e.target.value)}/></label><label className="span-two">JSON body template<textarea disabled={disabled} value={JSON.stringify(step.config.body_template??{},null,2)} onChange={(e)=>{try{patch(index,"body_template",JSON.parse(e.target.value));}catch{}}}/></label></div>;
  if(step.step_type==="conditional_branch")return <div className="grid-four"><label>Output path<input disabled={disabled} value={String(step.config.path??"sentiment")} onChange={(e)=>patch(index,"path",e.target.value)}/></label><label>Equals<input disabled={disabled} value={String(step.config.value??"positive")} onChange={(e)=>patch(index,"value",e.target.value)}/></label><label>True → step<select disabled={disabled} value={Number(step.config.true_step_order??Math.min(total,step.step_order+1))} onChange={(e)=>patch(index,"true_step_order",Number(e.target.value))}>{Array.from({length:Math.max(0,total-step.step_order)},(_,i)=>step.step_order+i+1).map((n)=><option key={n} value={n}>{n}</option>)}</select></label><label>False → step<select disabled={disabled} value={Number(step.config.false_step_order??total)} onChange={(e)=>patch(index,"false_step_order",Number(e.target.value))}>{Array.from({length:Math.max(0,total-step.step_order)},(_,i)=>step.step_order+i+1).map((n)=><option key={n} value={n}>{n}</option>)}</select></label></div>;
  if(step.step_type==="approval_gate")return <div className="grid-two"><label>Message<input disabled={disabled} value={String(step.config.message??"")} onChange={(e)=>patch(index,"message",e.target.value)}/></label><label>Approver<select disabled={disabled} value={String(step.config.required_role??"owner_or_editor")} onChange={(e)=>patch(index,"required_role",e.target.value)}><option value="owner_or_editor">Owner or editor</option><option value="owner">Owner only</option></select></label></div>;
  if(step.step_type==="db_write")return <label>Result key<input disabled={disabled} value={String(step.config.result_key??"result")} onChange={(e)=>patch(index,"result_key",e.target.value)}/></label>;
  return <div className="grid-two"><label>Channel<select disabled={disabled} value={String(step.config.channel??"demo")} onChange={(e)=>patch(index,"channel",e.target.value)}><option value="demo">Demo outbox</option><option value="slack">Slack</option><option value="email">Email</option></select></label><label>Destination<input disabled={disabled} value={String(step.config.destination??"")} onChange={(e)=>patch(index,"destination",e.target.value)}/></label><label className="span-two">Message<input disabled={disabled} value={String(step.config.message_template??"")} onChange={(e)=>patch(index,"message_template",e.target.value)}/></label></div>;
}
