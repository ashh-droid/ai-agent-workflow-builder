import { ImageResponse } from "next/og";

export const alt = "AgentFlow — secure multi-tenant AI workflow orchestration";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const steps = [
  { label: "LLM", title: "Gemini classification", accent: "#38bdf8" },
  { label: "IF", title: "Conditional routing", accent: "#facc15" },
  { label: "HTTP", title: "External API", accent: "#34d399" },
  { label: "GATE", title: "Human approval", accent: "#fb923c" },
  { label: "DB", title: "Protected persistence", accent: "#a78bfa" },
  { label: "NOTIFY", title: "Completion event", accent: "#f472b6" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#08090d",
          color: "#f3f4f6",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "radial-gradient(circle at 80% 18%, rgba(99,102,241,.2), transparent 34%), radial-gradient(circle at 20% 86%, rgba(56,189,248,.08), transparent 32%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "68px 72px",
            gap: 56,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 560 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(145deg, #6366f1, #7c3aed)",
                  marginRight: 18,
                  fontSize: 28,
                  fontWeight: 800,
                }}
              >
                af
              </div>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 800, letterSpacing: -2 }}>
                agent<span style={{ color: "#818cf8" }}>flow</span>
              </div>
            </div>

            <div style={{ display: "flex", color: "#a5b4fc", fontSize: 18, fontWeight: 700, letterSpacing: 2.2, marginBottom: 18 }}>
              MULTI-TENANT · LIVE · GUARDED
            </div>

            <div style={{ display: "flex", fontSize: 50, lineHeight: 1.06, fontWeight: 800, letterSpacing: -2.1, marginBottom: 24 }}>
              AI workflows that stay observable and human-controlled.
            </div>

            <div style={{ display: "flex", color: "#aeb4c2", fontSize: 21, lineHeight: 1.45, maxWidth: 545, marginBottom: 34 }}>
              Nhost + Hasura + PostgreSQL + Next.js with live execution, conditional routing and approval gates.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["Org isolation", "GraphQL subscriptions", "Pause / resume", "Real HTTP"].map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    padding: "9px 13px",
                    borderRadius: 999,
                    border: "1px solid #282c3c",
                    background: "#11131a",
                    color: "#c7cad4",
                    fontSize: 15,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 440,
              justifyContent: "center",
              padding: "28px 26px",
              borderRadius: 24,
              border: "1px solid #2d3150",
              background: "linear-gradient(180deg, rgba(20,23,34,.98), rgba(12,14,21,.98))",
              boxShadow: "0 24px 70px rgba(0,0,0,.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 20, fontWeight: 750 }}>Customer Sentiment Guardrail</div>
                <div style={{ display: "flex", color: "#737b90", fontSize: 13, marginTop: 5 }}>6 guarded steps · live execution</div>
              </div>
              <div style={{ display: "flex", padding: "7px 10px", borderRadius: 9, color: "#86efac", background: "#0e2a1d", fontSize: 12, fontWeight: 700 }}>
                READY
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {steps.map((step, index) => (
                <div
                  key={step.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 58,
                    padding: "0 14px",
                    borderRadius: 12,
                    border: "1px solid #242838",
                    borderLeft: `3px solid ${step.accent}`,
                    background: "#151821",
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px solid ${step.accent}`,
                      color: step.accent,
                      marginRight: 12,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ display: "flex", width: 66, color: step.accent, fontSize: 12, fontWeight: 800 }}>{step.label}</div>
                  <div style={{ display: "flex", color: "#e2e5ec", fontSize: 15, fontWeight: 650 }}>{step.title}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
