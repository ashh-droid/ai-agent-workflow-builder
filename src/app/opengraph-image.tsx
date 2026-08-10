import { ImageResponse } from "next/og";

export const alt = "AgentFlow — secure multi-tenant AI workflow orchestration";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const screenshot = "https://ai-agent-workflow-builder-seven.vercel.app/agentflow-completed-run.webp";

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
          color: "#e0e2e9",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <img
          src={screenshot}
          alt=""
          width="1200"
          height="630"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            opacity: 0.52,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "linear-gradient(90deg, rgba(8,9,13,.97) 0%, rgba(8,9,13,.88) 42%, rgba(8,9,13,.35) 75%, rgba(8,9,13,.18) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 700,
            padding: "72px 76px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 34 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#6366f1",
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              af
            </div>
            <div style={{ display: "flex", fontSize: 42, fontWeight: 750, letterSpacing: -2 }}>
              agent<span style={{ color: "#818cf8" }}>flow</span>
            </div>
          </div>
          <div style={{ display: "flex", color: "#a5b4fc", fontSize: 18, fontWeight: 700, letterSpacing: 2.4, marginBottom: 20 }}>
            MULTI-TENANT · LIVE · GUARDED
          </div>
          <div style={{ display: "flex", fontSize: 52, lineHeight: 1.04, fontWeight: 750, letterSpacing: -2.3, marginBottom: 24 }}>
            AI workflows that stay observable and human-controlled.
          </div>
          <div style={{ display: "flex", color: "#b5bac7", fontSize: 21, lineHeight: 1.45, maxWidth: 620 }}>
            Gemini · Conditional routing · HTTP · Approval gates · Database writes · GraphQL subscriptions
          </div>
        </div>
      </div>
    ),
    size,
  );
}
