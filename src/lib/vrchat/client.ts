import https from "node:https";
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

const API_HOST = "api.vrchat.cloud";
const API_PREFIX = "/api/1";

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

function extractCookie(setCookies: string[], name: string): string | undefined {
  const want = name.toLowerCase();
  for (const line of setCookies) {
    const first = line.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const key = first.slice(0, eq).trim().toLowerCase();
    let value = first.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (key === want && value) return value;
  }
  return undefined;
}

/** Accept raw token or `auth=token` / quoted forms from the client. */
export function normalizeAuthCookie(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  if (/^auth=/i.test(value)) {
    value = value.replace(/^auth=/i, "").trim();
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  return value;
}

export function normalizeTwoFactorMethod(
  method: string | undefined | null,
): TwoFactorMethod {
  const m = (method ?? "totp").toLowerCase().replace(/[_-]/g, "");
  if (m === "emailotp" || m === "email") return "emailotp";
  if (m === "otp") return "otp";
  return "totp";
}

export function normalizeTwoFactorMethods(
  methods: string[] | undefined,
): TwoFactorMethod[] {
  if (!methods?.length) return ["totp"];
  const normalized = methods.map((m) => normalizeTwoFactorMethod(m));
  return [...new Set(normalized)];
}

function parseBodyText(text: string): unknown {
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

type VrchatHttpResult = {
  status: number;
  ok: boolean;
  body: unknown;
  setCookies: string[];
};

/**
 * Use Node https (not global fetch) so Set-Cookie headers are preserved.
 * Next/Vercel fetch often drops or folds upstream Set-Cookie, which breaks 2FA.
 */
function vrchatHttps(
  path: string,
  options: RequestOptions = {},
): Promise<VrchatHttpResult> {
  const headers: Record<string, string> = {
    "user-agent": userAgent(),
    accept: "application/json",
  };

  if (options.basicAuth) {
    headers.authorization = `Basic ${options.basicAuth}`;
  }

  if (options.session?.authCookie) {
    headers.cookie = cookieHeader(options.session);
  }

  const payload =
    options.body !== undefined ? JSON.stringify(options.body) : undefined;
  if (payload !== undefined) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(payload).toString();
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        servername: API_HOST,
        path: `${API_PREFIX}${path}`,
        method: options.method ?? "GET",
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const body = parseBodyText(text);
          const setCookieHeader = res.headers["set-cookie"];
          const setCookies = Array.isArray(setCookieHeader)
            ? setCookieHeader
            : setCookieHeader
              ? [setCookieHeader]
              : [];
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            body,
            setCookies,
          });
        });
      },
    );

    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function vrchatFetch(
  path: string,
  options: RequestOptions = {},
): Promise<VrchatHttpResult> {
  const result = await vrchatHttps(path, options);

  if (!result.ok && !(options.allowUnauthorized && result.status === 401)) {
    if (result.status === 401) {
      throw new VrchatAuthError(errorMessage(result.body, "Unauthorized"));
    }
    throw new VrchatApiError(
      errorMessage(result.body, `VRChat API error (${result.status})`),
      result.status,
      result.body,
    );
  }

  return result;
}

function encodeBasicAuth(username: string, password: string): string {
  const raw = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  return Buffer.from(raw, "utf8").toString("base64");
}

function isTwoFactorResponse(
  body: unknown,
): body is { requiresTwoFactorAuth: string[] } {
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
  const { body, setCookies, status, ok } = await vrchatFetch("/auth/user", {
    basicAuth: encodeBasicAuth(username, password),
    allowUnauthorized: true,
  });

  const authCookie = extractCookie(setCookies, "auth");

  if (isTwoFactorResponse(body)) {
    if (!authCookie) {
      throw new VrchatApiError(
        "Two-factor required but no auth cookie was returned (Set-Cookie missing). Retry sign-in.",
        401,
        { body, setCookieCount: setCookies.length },
      );
    }
    return {
      status: "twoFactorRequired",
      methods: normalizeTwoFactorMethods(body.requiresTwoFactorAuth),
      pendingAuthCookie: authCookie,
    };
  }

  if (!ok || !authCookie) {
    throw new VrchatApiError(
      errorMessage(body, "Login failed — check username and password"),
      status || 401,
      body,
    );
  }

  return {
    status: "ok",
    user: body as VrchatUser,
    session: { authCookie },
  };
}

export async function loginWithPasswordAndTwoFactor(params: {
  username: string;
  password: string;
  code: string;
  method?: TwoFactorMethod | string;
}): Promise<{ user: VrchatUser; session: SessionCookies }> {
  /**
   * Must run login + 2FA in the same serverless invocation.
   * Splitting them across requests often fails on Vercel because the pending
   * auth cookie from password login is tied to that request's egress path.
   */
  const login = await loginWithPassword(params.username, params.password);

  if (login.status === "ok") {
    return { user: login.user, session: login.session };
  }

  return verifyTwoFactor({
    authCookie: login.pendingAuthCookie,
    code: params.code,
    method: params.method ?? login.methods[0] ?? "totp",
  });
}

export async function verifyTwoFactor(params: {
  authCookie: string;
  code: string;
  method: TwoFactorMethod | string;
}): Promise<{ user: VrchatUser; session: SessionCookies }> {
  const method = normalizeTwoFactorMethod(params.method);
  const authCookie = normalizeAuthCookie(params.authCookie);
  if (!authCookie) {
    throw new VrchatApiError(
      "Missing pending auth cookie — sign in again",
      400,
    );
  }

  const pendingSession = asSession({ authCookie });

  const pathByMethod: Record<TwoFactorMethod, string> = {
    totp: "/auth/twofactorauth/totp/verify",
    otp: "/auth/twofactorauth/otp/verify",
    emailotp: "/auth/twofactorauth/emailotp/verify",
  };

  const path = pathByMethod[method];
  const { body, setCookies, status, ok } = await vrchatFetch(path, {
    method: "POST",
    body: { code: params.code.trim() },
    session: pendingSession,
    allowUnauthorized: true,
  });

  if (!ok) {
    throw new VrchatApiError(
      errorMessage(
        body,
        status === 401
          ? "VRChat rejected 2FA (wrong code or expired login session). Sign in again and use a new authenticator code."
          : "Two-factor verification failed",
      ),
      status,
      { step: "verify", body },
    );
  }

  if (
    !(
      body &&
      typeof body === "object" &&
      (body as { verified?: boolean }).verified
    )
  ) {
    throw new VrchatApiError(
      errorMessage(
        body,
        "Invalid two-factor code — wait for a new code and try again",
      ),
      401,
      { step: "verify", body },
    );
  }

  const twoFactorAuthCookie = extractCookie(setCookies, "twoFactorAuth");
  if (!twoFactorAuthCookie) {
    throw new VrchatApiError(
      "2FA succeeded but twoFactorAuth cookie was missing from VRChat response.",
      502,
      { step: "cookies", setCookieCount: setCookies.length },
    );
  }

  const session: SessionCookies = {
    authCookie,
    twoFactorAuthCookie,
  };

  try {
    const user = await getCurrentUser(session);
    return { user, session };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load user after 2FA";
    throw new VrchatApiError(
      `2FA verified but session incomplete: ${message}`,
      401,
      { step: "session" },
    );
  }
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
