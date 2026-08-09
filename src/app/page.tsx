"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers";
export default function Home() { const { session, isLoading } = useAuth(); const router = useRouter(); useEffect(() => { if (!isLoading) router.replace(session ? "/app" : "/login"); }, [session, isLoading, router]); return <main className="loading-page"><div className="pulse-logo">AG</div><p>Preparing AgentFlow…</p></main>; }
