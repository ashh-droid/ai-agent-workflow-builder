import type { Metadata } from "next";
import "./globals.css";
import "./evaluator-polish.css";
import "./responsive-polish.css";
import "./final-polish.css";
import "./reviewer-guidance-polish.css";
import "./brand-control-polish.css";
import "./login-balance.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "AgentFlow — AI Agent Workflow Builder",
  description: "Secure multi-tenant AI workflow orchestration on Nhost + Hasura",
  applicationName: "AgentFlow",
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
