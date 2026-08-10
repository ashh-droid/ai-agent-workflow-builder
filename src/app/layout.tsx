import type { Metadata } from "next";
import "./globals.css";
import "./evaluator-polish.css";
import "./responsive-polish.css";
import "./final-polish.css";
import "./reviewer-guidance-polish.css";
import "./brand-control-polish.css";
import "./login-balance.css";
import { Providers } from "@/components/providers";

const siteUrl = "https://ai-agent-workflow-builder-seven.vercel.app";
const title = "AgentFlow — AI Agent Workflow Builder";
const description = "Secure multi-tenant AI workflow orchestration with live execution, conditional routing, human approval, and role-aware controls.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "AgentFlow",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "AgentFlow",
    title,
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "AgentFlow workflow builder with live execution" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#6366f1" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
