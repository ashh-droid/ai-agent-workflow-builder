"use client";

import { Check, GitBranch, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./providers";

const demoAccounts = [
  { email: "owner-a@example.com", password: "K7#mQ2@xP", role: "owner", org: "Northstar AI" },
  { email: "editor-a@example.com", password: "vR8!nL4$z", role: "editor", org: "Northstar AI" },
  { email: "owner-b@example.com", password: "T3@pX9#kW", role: "owner", org: "Orbit Labs" },
  { email: "viewer-b@example.com", password: "m6$Qz1!Hs", role: "viewer", org: "Orbit Labs" },
];

const previewSteps = [
  { type: "llm_call", label: "LLM", description: "Gemini classifies the input" },
  { type: "conditional_branch", label: "IF", description: "Output changes the path" },
  { type: "approval_gate", label: "GATE", description: "Human approval pauses execution" },
  { type: "db_write", label: "DB", description: "Approved result is persisted" },
];

export function LoginForm() {
  const { nhost } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function chooseDemo(emailValue: string, passwordValue: string) {
    setEmail(emailValue);
    setPassword(passwordValue);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await nhost.auth.signInEmailPassword({ email, password });
      if (!response.body?.session) throw new Error("Sign in failed");
      router.replace("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="login-dot-grid" />
        <div className="login-glow" />
        <div className="login-story-content">
          <div className="login-brand-block">
            <div className="wordmark wordmark-large">agent<span>flow</span></div>
            <p className="login-tagline">Secure orchestration for AI agents.</p>
          </div>

          <div className="login-story-main">
            <div className="login-hero-copy">
              <span className="login-kicker">MULTI-ORG · LIVE · GUARDED</span>
              <h2>Build agent workflows that stay observable and human-controlled.</h2>
              <p>Compose Gemini, conditional routing, real HTTP calls, approval gates and database writes — with organization isolation and role enforcement at every layer.</p>
            </div>

            <div className="login-pipeline" aria-label="Workflow pipeline preview">
              {previewSteps.map((step, index) => (
                <div className={`login-pipeline-step step-${step.type}`} key={step.type}>
                  <div className="login-pipeline-node"><span /></div>
                  <div className="login-pipeline-line" />
                  <code>{step.label}</code>
                  <span>{step.description}</span>
                  {index < previewSteps.length - 1 && <div className="login-pipeline-connector" />}
                </div>
              ))}
            </div>
          </div>

          <div className="login-proof-row">
            <span><ShieldCheck size={14} />Multi-org isolation</span>
            <span><GitBranch size={14} />Conditional routing</span>
            <span><Sparkles size={14} />Live subscriptions</span>
            <span><Check size={14} />Approval gates</span>
          </div>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form-card">
          <div className="mobile-wordmark wordmark">agent<span>flow</span></div>
          <div className="login-heading">
            <p>REVIEWER ACCESS</p>
            <h1>Welcome to AgentFlow</h1>
            <span>Choose a demo role below or enter credentials.</span>
          </div>

          <div className="auth-tabs compact-tabs">
            <button className="active" type="button" aria-current="page">Sign in</button>
          </div>

          <form onSubmit={submit} className="stack gap-md login-form-fields">
            <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner-a@example.com" /></label>
            <label>Password<input type="password" required minLength={9} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 9 characters" /></label>
            {error && <div className="error-banner">{error}</div>}
            <button className="primary login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to workspace"}</button>
          </form>

          <div className="demo-credentials">
            <div className="demo-credentials-heading">
              <div><strong>Reviewer accounts</strong><span>One click fills the credentials</span></div>
              <span className="demo-live-pill">LIVE DEMO</span>
            </div>
            <div className="demo-account-list">
              {demoAccounts.map((account) => (
                <button
                  className="demo-account"
                  type="button"
                  key={account.email}
                  onClick={() => chooseDemo(account.email, account.password)}
                >
                  <div>
                    <strong>{account.email}</strong>
                    <code>{account.password}</code>
                  </div>
                  <span>{account.role}<small>{account.org}</small></span>
                </button>
              ))}
            </div>
            <p className="demo-note">Use Owner A for the complete workflow demo, Editor A for approval, and Viewer B to verify cross-org restrictions.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
