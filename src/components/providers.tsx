"use client";
import { createClient as createNhostClient, type NhostClient, type StoredSession } from "@nhost/nhost-js";
import { print } from "graphql";
import { createClient as createWsClient, type Client as WsClient } from "graphql-ws";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cacheExchange, createClient as createUrqlClient, fetchExchange, Provider as UrqlProvider, subscriptionExchange } from "urql";
interface AuthValue { nhost: NhostClient; session: StoredSession | null; isLoading: boolean; }
const AuthContext = createContext<AuthValue | null>(null);
function graphqlUrl() {
  const explicit = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL;
  if (explicit) return explicit;
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local";
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || "local";
  return subdomain === "local" ? "https://local.graphql.local.nhost.run/v1" : `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}
export function Providers({ children }: { children: ReactNode }) {
  const nhost = useMemo(() => createNhostClient({ subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local", region: process.env.NEXT_PUBLIC_NHOST_REGION || "local" }), []);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isLoading, setLoading] = useState(true);
  useEffect(() => { setSession(nhost.getUserSession()); setLoading(false); return nhost.sessionStorage.onChange((next) => setSession(next)); }, [nhost]);
  const wsClient = useMemo<WsClient>(() => createWsClient({ url: graphqlUrl().replace(/^http/, "ws"), connectionParams: () => session?.accessToken ? { headers: { Authorization: `Bearer ${session.accessToken}` } } : {} }), [session?.accessToken]);
  useEffect(() => () => { void wsClient.dispose(); }, [wsClient]);
  const urql = useMemo(() => createUrqlClient({
    url: graphqlUrl(),
    fetchOptions: () => ({ headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {} }),
    exchanges: [cacheExchange, fetchExchange, subscriptionExchange({ forwardSubscription(request) { const input = { ...request, query: print(request.query) }; return { subscribe(sink) { const unsubscribe = wsClient.subscribe(input, sink); return { unsubscribe }; } }; } })],
  }), [session?.accessToken, wsClient]);
  return <AuthContext.Provider value={{ nhost, session, isLoading }}><UrqlProvider value={urql}>{children}</UrqlProvider></AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside Providers"); return value; }
