import type { Metadata } from "next";
import "./globals.css";
import "./evaluator-polish.css";
import "./responsive-polish.css";
import "./final-polish.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "AgentFlow — AI Agent Workflow Builder",
  description: "Secure multi-tenant AI workflow orchestration on Nhost + Hasura",
  applicationName: "AgentFlow",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
