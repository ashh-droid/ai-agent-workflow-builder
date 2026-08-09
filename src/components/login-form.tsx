"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./providers";
export function LoginForm() {
  const { nhost } = useAuth(); const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin"); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = mode === "signin" ? await nhost.auth.signInEmailPassword({ email, password }) : await nhost.auth.signUpEmailPassword({ email, password, options: { displayName: name || email.split("@")[0], allowedRoles: ["user"], defaultRole: "user" } });
      if (!response.body?.session) throw new Error(mode === "signup" ? "Account created, but no session was returned. Check email-verification settings." : "Sign in failed");
      router.replace("/app");
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed"); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-panel"><div className="brand-mark">AG</div><p className="eyebrow">AI AGENT WORKFLOW BUILDER</p><h1>Orchestrate agent steps with guardrails.</h1><p className="muted">Nhost Auth, Hasura permissions, live GraphQL subscriptions, approval gates, and real Gemini execution.</p><div className="auth-tabs"><button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")} type="button">Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} type="button">Create account</button></div><form onSubmit={submit} className="stack gap-md">{mode === "signup" && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Demo Owner" /></label>}<label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner-a@example.com" /></label><label>Password<input type="password" required minLength={9} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 9 characters" /></label>{error && <div className="error-banner">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button></form></section></main>;
}
