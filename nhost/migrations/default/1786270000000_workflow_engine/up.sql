CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  quota_limit integer NOT NULL DEFAULT 100 CHECK (quota_limit > 0),
  quota_used integer NOT NULL DEFAULT 0 CHECK (quota_used >= 0),
  quota_remaining integer NOT NULL DEFAULT 100 CHECK (quota_remaining >= 0),
  quota_reset_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_quota_bounds CHECK (quota_used + quota_remaining <= quota_limit)
);
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,user_id)
);
CREATE INDEX org_members_user_idx ON public.org_members(user_id);
CREATE INDEX org_members_org_role_idx ON public.org_members(org_id, role);

CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL, description text, is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,org_id)
);
CREATE INDEX workflows_org_idx ON public.workflows(org_id, updated_at DESC);

CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL, org_id uuid NOT NULL,
  step_order integer NOT NULL CHECK(step_order>0),
  step_type text NOT NULL CHECK(step_type IN ('llm_call','http_request','db_write','notify','conditional_branch','approval_gate')),
  name text NOT NULL, config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_id,step_order), UNIQUE(id,org_id),
  FOREIGN KEY(workflow_id,org_id) REFERENCES public.workflows(id,org_id) ON DELETE CASCADE
);
CREATE INDEX workflow_steps_org_workflow_idx ON public.workflow_steps(org_id,workflow_id,step_order);

CREATE TABLE public.workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL, org_id uuid NOT NULL,
  trigger_type text NOT NULL CHECK(trigger_type IN ('manual','webhook','scheduled','db_event')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb, secret_hash text, is_active boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,org_id), FOREIGN KEY(workflow_id,org_id) REFERENCES public.workflows(id,org_id) ON DELETE CASCADE
);
CREATE INDEX workflow_triggers_org_type_idx ON public.workflow_triggers(org_id,trigger_type,is_active);

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL, org_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','paused','completed','failed','cancelled')),
  trigger_type text NOT NULL CHECK(trigger_type IN ('manual','webhook','scheduled','db_event')),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, trigger_payload jsonb,
  next_step_order integer NOT NULL DEFAULT 1 CHECK(next_step_order>0), quota_reserved boolean NOT NULL DEFAULT true,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,org_id), FOREIGN KEY(workflow_id,org_id) REFERENCES public.workflows(id,org_id) ON DELETE CASCADE
);
CREATE INDEX workflow_runs_org_created_idx ON public.workflow_runs(org_id,created_at DESC);
CREATE INDEX workflow_runs_workflow_created_idx ON public.workflow_runs(workflow_id,created_at DESC);
CREATE INDEX workflow_runs_status_idx ON public.workflow_runs(status,created_at);

CREATE TABLE public.step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_run_id uuid NOT NULL,
  workflow_step_id uuid REFERENCES public.workflow_steps(id) ON DELETE SET NULL, org_id uuid NOT NULL,
  step_order integer NOT NULL CHECK(step_order>0), step_type text NOT NULL, step_name text NOT NULL,
  step_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','skipped','waiting_approval','approved')),
  input jsonb, output jsonb, error text, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, approved_at timestamptz,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_run_id,step_order), UNIQUE(id,org_id),
  FOREIGN KEY(workflow_run_id,org_id) REFERENCES public.workflow_runs(id,org_id) ON DELETE CASCADE
);
CREATE INDEX step_runs_run_order_idx ON public.step_runs(workflow_run_id,step_order);
CREATE INDEX step_runs_org_status_idx ON public.step_runs(org_id,status);

CREATE TABLE public.workflow_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL, workflow_run_id uuid NOT NULL, step_run_id uuid NOT NULL,
  result_key text NOT NULL DEFAULT 'result', data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workflow_id,org_id) REFERENCES public.workflows(id,org_id) ON DELETE CASCADE,
  FOREIGN KEY(workflow_run_id,org_id) REFERENCES public.workflow_runs(id,org_id) ON DELETE CASCADE,
  FOREIGN KEY(step_run_id,org_id) REFERENCES public.step_runs(id,org_id) ON DELETE CASCADE
);
CREATE INDEX workflow_results_org_idx ON public.workflow_results(org_id,created_at DESC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_run_id uuid NOT NULL, step_run_id uuid NOT NULL,
  channel text NOT NULL CHECK(channel IN ('slack','email','demo')), destination text, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed')), error text, delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workflow_run_id,org_id) REFERENCES public.workflow_runs(id,org_id) ON DELETE CASCADE,
  FOREIGN KEY(step_run_id,org_id) REFERENCES public.step_runs(id,org_id) ON DELETE CASCADE
);
CREATE INDEX notifications_status_idx ON public.notifications(status,created_at);

CREATE TABLE public.trigger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_name text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trigger_events_org_name_idx ON public.trigger_events(org_id,event_name,created_at DESC);

CREATE OR REPLACE VIEW public.org_monthly_usage AS
SELECT o.id AS org_id,o.name AS org_name,o.quota_limit,o.quota_used,o.quota_remaining,
(o.quota_limit-o.quota_used-o.quota_remaining) AS quota_reserved,
COUNT(wr.id) FILTER(WHERE wr.created_at>=date_trunc('month',now()))::integer AS total_runs_this_month,
AVG(EXTRACT(EPOCH FROM (wr.completed_at-wr.started_at))) FILTER(WHERE wr.completed_at IS NOT NULL AND wr.started_at IS NOT NULL) AS avg_run_duration_seconds,
COUNT(wr.id) FILTER(WHERE wr.created_at>=date_trunc('month',now()) AND wr.status='completed')::integer AS successful_runs,
COUNT(wr.id) FILTER(WHERE wr.created_at>=date_trunc('month',now()) AND wr.status='failed')::integer AS failed_runs
FROM public.organizations o LEFT JOIN public.workflow_runs wr ON wr.org_id=o.id
GROUP BY o.id,o.name,o.quota_limit,o.quota_used,o.quota_remaining;

CREATE OR REPLACE FUNCTION public.settle_workflow_run_quota() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.quota_reserved=true AND NEW.status IN ('completed','failed','cancelled') THEN
  IF NEW.status='completed' THEN UPDATE public.organizations SET quota_used=quota_used+1 WHERE id=NEW.org_id;
  ELSE UPDATE public.organizations SET quota_remaining=quota_remaining+1 WHERE id=NEW.org_id; END IF;
  NEW.quota_reserved=false;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER workflow_runs_settle_quota BEFORE UPDATE OF status ON public.workflow_runs FOR EACH ROW EXECUTE FUNCTION public.settle_workflow_run_quota();
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER workflows_updated_at BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER workflow_steps_updated_at BEFORE UPDATE ON public.workflow_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER workflow_triggers_updated_at BEFORE UPDATE ON public.workflow_triggers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER workflow_runs_updated_at BEFORE UPDATE ON public.workflow_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER step_runs_updated_at BEFORE UPDATE ON public.step_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
