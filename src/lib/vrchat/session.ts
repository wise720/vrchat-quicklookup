import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/paths";
import type { VrchatSession } from "@/lib/vrchat/types";

function sessionPath(): string {
  return path.join(getDataDir(), "vrchat-session.json");
}

export async function loadSession(): Promise<VrchatSession | null> {
  try {
    const raw = await readFile(sessionPath(), "utf8");
    const parsed = JSON.parse(raw) as VrchatSession;
    if (!parsed?.authCookie) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(session: VrchatSession): Promise<void> {
  const dir = getDataDir();
  await mkdir(dir, { recursive: true });
  await writeFile(sessionPath(), JSON.stringify(session, null, 2), "utf8");
}

export async function clearSession(): Promise<void> {
  try {
    await unlink(sessionPath());
  } catch {
    // already gone
  }
}

export function cookieHeader(session: VrchatSession): string {
  const parts = [`auth=${session.authCookie}`];
  if (session.twoFactorAuthCookie) {
    parts.push(`twoFactorAuth=${session.twoFactorAuthCookie}`);
  }
  return parts.join("; ");
}
