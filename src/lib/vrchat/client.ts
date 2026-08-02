import { cookieHeader } from "@/lib/vrchat/session";
import type {
  TwoFactorMethod,
  VrchatGroup,
  VrchatGroupMembership,
  VrchatSession,
  VrchatUser,
  SessionCookies,
} from "@/lib/vrchat/types";

export type { SessionCookies };

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
  const version = process.env.npm_package_version || "0.2.0";

  let ua = explicit;
  if (!ua && contact) {
    ua = `${appName}/${version} ${contact}`;
  }

  if (!ua) {
    throw new Error(
      "Set VRCHAT_CONTACT (email or URL) in env — VRChat requires a User-Agent with app name, version, and contact info.",
    );
  }

  if (
    /you@example\.com/i.test(ua) ||
    /example\.(com|org|net)/i.test(ua) ||
    /changeme/i.test(ua)
  ) {
    throw new Error(
      "VRCHAT_USER_AGENT / VRCHAT_CONTACT still uses a placeholder. Set a real email or URL VRChat can contact you at.",
    );
  }

  const hasVersion = /\S+\/\d+(\.\d+)*/.test(ua);
  const hasContact = /\S+@\S+\.\S+|https?:\/\/\S+/i.test(ua);
  if (!hasVersion || !hasContact) {
    throw new Error(
      `User-Agent must look like "${appName}/${version} you@email.com". Got: ${ua}`,
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
    Array.isArray(
      (body as { requiresTwoFactorAuth?: unknown }).requiresTwoFactorAuth,
    )
  );
}

function asSession(session: VrchatSession | SessionCookies): VrchatSession {
  return {
    authCookie: session.authCookie,
    twoFactorAuthCookie: session.twoFactorAuthCookie,
    updatedAt: new Date().toISOString(),
  };
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<
  | { status: "ok"; user: VrchatUser; session: SessionCookies }
  | {
      status: "twoFactorRequired";
      methods: TwoFactorMethod[];
      pendingAuthCookie: string;
    }
> {
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

  return {
    status: "ok",
    user: body as VrchatUser,
    session: { authCookie },
  };
}

export async function verifyTwoFactor(params: {
  authCookie: string;
  code: string;
  method: TwoFactorMethod;
}): Promise<{ user: VrchatUser; session: SessionCookies }> {
  const pathByMethod: Record<TwoFactorMethod, string> = {
    totp: "/auth/twofactorauth/totp/verify",
    otp: "/auth/twofactorauth/otp/verify",
    emailotp: "/auth/twofactorauth/emailotp/verify",
  };

  const { body, setCookies } = await vrchatFetch(pathByMethod[params.method], {
    method: "POST",
    body: { code: params.code.trim() },
    session: asSession({ authCookie: params.authCookie }),
  });

  if (
    !(
      body &&
      typeof body === "object" &&
      (body as { verified?: boolean }).verified
    )
  ) {
    throw new VrchatApiError(
      errorMessage(body, "Two-factor verification failed"),
      401,
      body,
    );
  }

  const twoFactorAuthCookie =
    extractCookie(setCookies, "twoFactorAuth") ?? undefined;

  const session: SessionCookies = {
    authCookie: params.authCookie,
    ...(twoFactorAuthCookie ? { twoFactorAuthCookie } : {}),
  };

  const user = await getCurrentUser(session);
  return { user, session };
}

export async function getCurrentUser(
  session: VrchatSession | SessionCookies,
): Promise<VrchatUser> {
  const { body } = await vrchatFetch("/auth/user", {
    session: asSession(session),
  });
  if (isTwoFactorResponse(body)) {
    throw new VrchatAuthError("Two-factor authentication required");
  }
  return body as VrchatUser;
}

export async function logout(
  session: VrchatSession | SessionCookies,
): Promise<void> {
  try {
    await vrchatFetch("/logout", {
      method: "PUT",
      session: asSession(session),
    });
  } catch {
    // client clears local session anyway
  }
}

export async function searchUsers(
  session: VrchatSession | SessionCookies,
  query: string,
  n = 20,
): Promise<VrchatUser[]> {
  const params = new URLSearchParams({
    search: query,
    n: String(Math.min(Math.max(n, 1), 100)),
  });
  const { body } = await vrchatFetch(`/users?${params}`, {
    session: asSession(session),
  });
  return Array.isArray(body) ? (body as VrchatUser[]) : [];
}

export async function getUser(
  session: VrchatSession | SessionCookies,
  userId: string,
): Promise<VrchatUser> {
  const { body } = await vrchatFetch(`/users/${encodeURIComponent(userId)}`, {
    session: asSession(session),
  });
  return body as VrchatUser;
}

export async function getUserGroups(
  session: VrchatSession | SessionCookies,
  userId: string,
): Promise<VrchatGroupMembership[]> {
  const { body } = await vrchatFetch(
    `/users/${encodeURIComponent(userId)}/groups`,
    { session: asSession(session) },
  );
  return Array.isArray(body) ? (body as VrchatGroupMembership[]) : [];
}

export async function getGroup(
  session: VrchatSession | SessionCookies,
  groupId: string,
): Promise<VrchatGroup> {
  const { body } = await vrchatFetch(
    `/groups/${encodeURIComponent(groupId)}`,
    { session: asSession(session) },
  );
  return body as VrchatGroup;
}

export async function searchGroups(
  session: VrchatSession | SessionCookies,
  query: string,
  n = 20,
): Promise<VrchatGroup[]> {
  const params = new URLSearchParams({
    query,
    n: String(Math.min(Math.max(n, 1), 100)),
  });
  const { body } = await vrchatFetch(`/groups?${params}`, {
    session: asSession(session),
  });
  return Array.isArray(body) ? (body as VrchatGroup[]) : [];
}

export function looksLikeUserId(query: string): boolean {
  const q = query.trim();
  return (
    /^usr_[0-9a-f-]{36}$/i.test(q) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)
  );
}
