import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/paths";
import type { TwoFactorMethod } from "@/lib/vrchat/types";

type PendingTwoFactor = {
  authCookie: string;
  methods: TwoFactorMethod[];
  createdAt: string;
};

function pendingPath(): string {
  return path.join(getDataDir(), "vrchat-pending-2fa.json");
}

export async function savePendingTwoFactor(
  pending: Omit<PendingTwoFactor, "createdAt">,
): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(
    pendingPath(),
    JSON.stringify({ ...pending, createdAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

export async function loadPendingTwoFactor(): Promise<PendingTwoFactor | null> {
  try {
    const raw = await readFile(pendingPath(), "utf8");
    return JSON.parse(raw) as PendingTwoFactor;
  } catch {
    return null;
  }
}

export async function clearPendingTwoFactor(): Promise<void> {
  try {
    await unlink(pendingPath());
  } catch {
    // ignore
  }
}
