"use client";

import type { SessionCookies } from "@/lib/vrchat/types";

const STORAGE_KEY = "vrchat-quicklookup.session";

export type ClientSession = SessionCookies;

export function loadClientSession(): ClientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientSession;
    if (!parsed?.authCookie) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveClientSession(session: ClientSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearClientSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function sessionHeaders(
  session: ClientSession | null = loadClientSession(),
): HeadersInit {
  if (!session?.authCookie) return {};
  const headers: Record<string, string> = {
    "X-VRChat-Auth": session.authCookie,
  };
  if (session.twoFactorAuthCookie) {
    headers["X-VRChat-TwoFactorAuth"] = session.twoFactorAuthCookie;
  }
  return headers;
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const session = loadClientSession();
  const extra = sessionHeaders(session);
  for (const [key, value] of Object.entries(extra)) {
    headers.set(key, value);
  }
  return fetch(input, { ...init, headers });
}
