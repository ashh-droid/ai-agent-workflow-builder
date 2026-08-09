import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";
import type { Request } from "express";
import { adminGraphql } from "./admin";
import type { OrgRole } from "./types";

export function requireNhostWebhook(req: Request): void {
  const expected = process.env.NHOST_WEBHOOK_SECRET;
  const received = req.header("nhost-webhook-secret") || "";
  if (!expected || !safeEqual(received, expected)) {
    const error = new Error("Invalid internal webhook signature");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}

export function actionUserId(sessionVariables?: Record<string, string>): string {
  const userId = sessionVariables?.["x-hasura-user-id"] || sessionVariables?.["X-Hasura-User-Id"];
  if (!userId) {
    const error = new Error("Authentication required");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return userId;
}

export async function getMembership(userId: string, orgId: string): Promise<OrgRole | null> {
  const data = await adminGraphql<{ org_members: Array<{ role: OrgRole }> }>(
    `query Membership($userId: uuid!, $orgId: uuid!) {
      org_members(where: {user_id: {_eq: $userId}, org_id: {_eq: $orgId}}, limit: 1) { role }
    }`,
    { userId, orgId },
  );
  return data.org_members[0]?.role ?? null;
}

export async function requireMembership(userId: string, orgId: string, allowed: OrgRole[]): Promise<OrgRole> {
  const role = await getMembership(userId, orgId);
  if (!role || !allowed.includes(role)) {
    const error = new Error("Not found or not authorized");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return role;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function assertWebhookSecret(secret: string, hash: string | null | undefined): void {
  if (!hash || !safeEqual(sha256(secret), hash)) {
    const error = new Error("Invalid webhook secret");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}

function isPrivateIp(address: string): boolean {
  if (address === "::1" || address === "0.0.0.0" || address === "::") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export async function assertSafeExternalUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("http_request only supports credential-free HTTP(S) URLs");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || isPrivateIp(host)) {
    throw new Error("http_request cannot target local/private network addresses");
  }
  const addresses = new Set<string>();
  try { (await resolve4(host)).forEach((ip) => addresses.add(ip)); } catch { /* IPv4 may be absent */ }
  try { (await resolve6(host)).forEach((ip) => addresses.add(ip)); } catch { /* IPv6 may be absent */ }
  if (addresses.size === 0 || [...addresses].some(isPrivateIp)) {
    throw new Error("http_request hostname resolves to an unavailable or private address");
  }
  return url;
}

export function sendError(res: { status: (code: number) => { json: (body: unknown) => unknown } }, error: unknown): void {
  const err = error instanceof Error ? error : new Error("Unknown error");
  const status = (err as Error & { status?: number }).status ?? 400;
  res.status(status).json({ message: err.message });
}
