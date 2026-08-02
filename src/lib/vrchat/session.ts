import type { VrchatSession } from "@/lib/vrchat/types";

export function cookieHeader(session: VrchatSession): string {
  // Importing normalize here would cycle; keep formatting local
  let auth = session.authCookie.trim();
  if (/^auth=/i.test(auth)) auth = auth.replace(/^auth=/i, "").trim();
  if (auth.startsWith('"') && auth.endsWith('"')) auth = auth.slice(1, -1);

  const parts = [`auth=${auth}`];
  if (session.twoFactorAuthCookie) {
    let tfa = session.twoFactorAuthCookie.trim();
    if (/^twofactorauth=/i.test(tfa)) {
      tfa = tfa.replace(/^twofactorauth=/i, "").trim();
    }
    if (tfa.startsWith('"') && tfa.endsWith('"')) tfa = tfa.slice(1, -1);
    parts.push(`twoFactorAuth=${tfa}`);
  }
  return parts.join("; ");
}

/** Read client-supplied VRChat cookies from proxy request headers. */
export function sessionFromRequest(request: Request): VrchatSession | null {
  const authCookie = request.headers.get("x-vrchat-auth")?.trim() || "";
  if (!authCookie) return null;

  const twoFactorAuthCookie =
    request.headers.get("x-vrchat-twofactorauth")?.trim() || undefined;

  return {
    authCookie,
    ...(twoFactorAuthCookie ? { twoFactorAuthCookie } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function requireSessionFromRequest(request: Request): VrchatSession {
  const session = sessionFromRequest(request);
  if (!session) {
    // Lazy import avoided — throw shape matching VrchatAuthError
    const err = new Error("Missing VRChat session (sign in again)") as Error & {
      status: number;
      name: string;
    };
    err.name = "VrchatAuthError";
    err.status = 401;
    throw err;
  }
  return session;
}
