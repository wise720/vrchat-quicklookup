import {
  clearSession,
  cookieHeader,
  loadSession,
  saveSession,
} from "@/lib/vrchat/session";
import type {
  LoginResult,
  TwoFactorMethod,
  VrchatGroup,
  VrchatGroupMembership,
  VrchatSession,
  VrchatUser,
} from "@/lib/vrchat/types";

const API_BASE = "https://api.vrchat.cloud/api/1";

export class VrchatApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "VrchatApiError";
    this.status = status;
    this.body = body;
  }
}

export class VrchatAuthError extends VrchatApiError {
  constructor(message = "VRChat session expired or missing") {
    super(message, 401);
    this.name = "VrchatAuthError";
  }
}

function userAgent(): string {
  const explicit = process.env.VRCHAT_USER_AGENT?.trim();
  const contact = process.env.VRCHAT_CONTACT?.trim();
  const appName = "VRChatQuickLookup";
  const version = process.env.npm_package_version || "0.1.0";

  let ua = explicit;
  if (!ua && contact) {
    ua = `${appName}/${version} ${contact}`;
  }

  if (!ua) {
    throw new Error(
      "Set VRCHAT_CONTACT (email or URL) in .env.local — VRChat requires a User-Agent with app name, version, and contact info.",
    );
  }

  // Reject common placeholders VRChat will refuse
  if (
    /you@example\.com/i.test(ua) ||
    /example\.(com|org|net)/i.test(ua) ||
    /changeme/i.test(ua)
  ) {
    throw new Error(
      "VRCHAT_USER_AGENT / VRCHAT_CONTACT still uses a placeholder. Set a real email or URL VRChat can contact you at.",
    );
  }

  // Ensure name/version/contact shape when only a bare contact was intended via full UA override checks
  const hasVersion = /\S+\/\d+(\.\d+)*/.test(ua);
  const hasContact = /\S+@\S+\.\S+|https?:\/\/\S+/i.test(ua);
  if (!hasVersion || !hasContact) {
    throw new Error(
      `User-Agent must look like "${appName}/${version} you@email.com" or "${appName}/${version} https://yoursite.example". Got: ${ua}`,
    );
  }

  return ua;
}

function parseSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function extractCookie(setCookies: string[], name: string): string | undefined {
  for (const line of setCookies) {
    const match = line.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  // Also handle plain "name=value; ..." first segment
  for (const line of setCookies) {
    const first = line.split(";")[0]?.trim();
    if (first?.startsWith(`${name}=`)) {
      return first.slice(name.length + 1);
    }
  }
  return undefined;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message.replace(/^"|"$/g, "");
  }
  if (typeof body === "string" && body.trim()) return body;
  return fallback;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  basicAuth?: string;
  session?: VrchatSession | null;
  allowUnauthorized?: boolean;
};

async function vrchatFetch(
  path: string,
  options: RequestOptions = {},
): Promise<{ res: Response; body: unknown; setCookies: string[] }> {
  const headers: Record<string, string> = {
    "User-Agent": userAgent(),
    Accept: "application/json",
  };

  if (options.basicAuth) {
    headers.Authorization = `Basic ${options.basicAuth}`;
  }

  if (options.session?.authCookie) {
    headers.Cookie = cookieHeader(options.session);
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const setCookies = parseSetCookies(res);
  const body = await parseJson(res);

  if (!res.ok && !(options.allowUnauthorized && res.status === 401)) {
    if (res.status === 401) {
      throw new VrchatAuthError(errorMessage(body, "Unauthorized"));
    }
    throw new VrchatApiError(
      errorMessage(body, `VRChat API error (${res.status})`),
      res.status,
      body,
    );
  }

  return { res, body, setCookies };
}

function encodeBasicAuth(username: string, password: string): string {
  const raw = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  return Buffer.from(raw, "utf8").toString("base64");
}

function isTwoFactorResponse(
  body: unknown,
): body is { requiresTwoFactorAuth: TwoFactorMethod[] } {
  return (
    !!body &&
    typeof body === "object" &&
    Array.isArray((body as { requiresTwoFactorAuth?: unknown }).requiresTwoFactorAuth)
  );
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<LoginResult & { pendingAuthCookie?: string }> {
  const { body, setCookies, res } = await vrchatFetch("/auth/user", {
    basicAuth: encodeBasicAuth(username, password),
    allowUnauthorized: true,
  });

  const authCookie = extractCookie(setCookies, "auth");

  if (isTwoFactorResponse(body)) {
    if (!authCookie) {
      throw new VrchatApiError(
        "Two-factor required but no auth cookie was returned",
        401,
        body,
      );
    }
    return {
      status: "twoFactorRequired",
      methods: body.requiresTwoFactorAuth,
      pendingAuthCookie: authCookie,
    };
  }

  if (!res.ok || !authCookie) {
    throw new VrchatApiError(
      errorMessage(body, "Login failed — check username and password"),
      res.status || 401,
      body,
    );
  }

  const session: VrchatSession = {
    authCookie,
    updatedAt: new Date().toISOString(),
  };
  await saveSession(session);

  return { status: "ok", user: body as VrchatUser };
}

export async function verifyTwoFactor(params: {
  authCookie: string;
  code: string;
  method: TwoFactorMethod;
}): Promise<VrchatUser> {
  const pathByMethod: Record<TwoFactorMethod, string> = {
    totp: "/auth/twofactorauth/totp/verify",
    otp: "/auth/twofactorauth/otp/verify",
    emailotp: "/auth/twofactorauth/emailotp/verify",
  };

  const pending: VrchatSession = {
    authCookie: params.authCookie,
    updatedAt: new Date().toISOString(),
  };

  const { body, setCookies } = await vrchatFetch(pathByMethod[params.method], {
    method: "POST",
    body: { code: params.code.trim() },
    session: pending,
  });

  if (
    !(body && typeof body === "object" && (body as { verified?: boolean }).verified)
  ) {
    throw new VrchatApiError(
      errorMessage(body, "Two-factor verification failed"),
      401,
      body,
    );
  }

  const twoFactorAuthCookie =
    extractCookie(setCookies, "twoFactorAuth") ?? undefined;

  await saveSession({
    authCookie: params.authCookie,
    twoFactorAuthCookie,
    updatedAt: new Date().toISOString(),
  });

  return getCurrentUser();
}

export async function getCurrentUser(): Promise<VrchatUser> {
  const session = await loadSession();
  if (!session) throw new VrchatAuthError();

  try {
    const { body } = await vrchatFetch("/auth/user", { session });
    if (isTwoFactorResponse(body)) {
      throw new VrchatAuthError("Two-factor authentication required");
    }
    return body as VrchatUser;
  } catch (err) {
    if (err instanceof VrchatAuthError) {
      await clearSession();
    }
    throw err;
  }
}

export async function logout(): Promise<void> {
  const session = await loadSession();
  if (session) {
    try {
      await vrchatFetch("/logout", { method: "PUT", session });
    } catch {
      // clear local anyway
    }
  }
  await clearSession();
}

export async function requireSession(): Promise<VrchatSession> {
  const session = await loadSession();
  if (!session) throw new VrchatAuthError();
  return session;
}

export async function searchUsers(query: string, n = 20): Promise<VrchatUser[]> {
  const session = await requireSession();
  const params = new URLSearchParams({
    search: query,
    n: String(Math.min(Math.max(n, 1), 100)),
  });
  try {
    const { body } = await vrchatFetch(`/users?${params}`, { session });
    return Array.isArray(body) ? (body as VrchatUser[]) : [];
  } catch (err) {
    if (err instanceof VrchatAuthError) await clearSession();
    throw err;
  }
}

export async function getUser(userId: string): Promise<VrchatUser> {
  const session = await requireSession();
  try {
    const { body } = await vrchatFetch(`/users/${encodeURIComponent(userId)}`, {
      session,
    });
    return body as VrchatUser;
  } catch (err) {
    if (err instanceof VrchatAuthError) await clearSession();
    throw err;
  }
}

export async function getUserGroups(
  userId: string,
): Promise<VrchatGroupMembership[]> {
  const session = await requireSession();
  try {
    const { body } = await vrchatFetch(
      `/users/${encodeURIComponent(userId)}/groups`,
      { session },
    );
    return Array.isArray(body) ? (body as VrchatGroupMembership[]) : [];
  } catch (err) {
    if (err instanceof VrchatAuthError) await clearSession();
    throw err;
  }
}

export async function getGroup(groupId: string): Promise<VrchatGroup> {
  const session = await requireSession();
  try {
    const { body } = await vrchatFetch(
      `/groups/${encodeURIComponent(groupId)}`,
      { session },
    );
    return body as VrchatGroup;
  } catch (err) {
    if (err instanceof VrchatAuthError) await clearSession();
    throw err;
  }
}

export async function searchGroups(
  query: string,
  n = 20,
): Promise<VrchatGroup[]> {
  const session = await requireSession();
  const params = new URLSearchParams({
    query,
    n: String(Math.min(Math.max(n, 1), 100)),
  });
  try {
    const { body } = await vrchatFetch(`/groups?${params}`, { session });
    return Array.isArray(body) ? (body as VrchatGroup[]) : [];
  } catch (err) {
    if (err instanceof VrchatAuthError) await clearSession();
    throw err;
  }
}

/** True if query looks like a VRChat user id */
export function looksLikeUserId(query: string): boolean {
  const q = query.trim();
  return /^usr_[0-9a-f-]{36}$/i.test(q) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
}
