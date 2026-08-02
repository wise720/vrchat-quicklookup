import { VRChat, VRChatError } from "vrchat";
import { ensureSchema, getSql } from "./db.js";

/** Keyv-compatible store backed by Neon `vrchat_keyv`. */
class NeonKeyvStore {
  opts = Object.create(null);
  namespace = "keyv";

  on() {
    return this;
  }
  off() {
    return this;
  }
  emit() {
    return false;
  }
  addListener() {
    return this;
  }
  removeListener() {
    return this;
  }
  once() {
    return this;
  }
  removeAllListeners() {
    return this;
  }
  setMaxListeners() {
    return this;
  }
  getMaxListeners() {
    return 0;
  }
  listeners() {
    return [];
  }
  rawListeners() {
    return [];
  }
  listenerCount() {
    return 0;
  }
  prependListener() {
    return this;
  }
  prependOnceListener() {
    return this;
  }
  eventNames() {
    return [];
  }

  async get(key: string): Promise<string | undefined> {
    await ensureSchema();
    const db = getSql();
    const rows = await db`
      SELECT value FROM vrchat_keyv WHERE key = ${key} LIMIT 1
    `;
    return rows[0] ? String(rows[0].value) : undefined;
  }

  async set(key: string, value: string): Promise<true> {
    await ensureSchema();
    const db = getSql();
    await db`
      INSERT INTO vrchat_keyv (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return true;
  }

  async delete(key: string): Promise<boolean> {
    await ensureSchema();
    const db = getSql();
    const rows = await db`
      DELETE FROM vrchat_keyv WHERE key = ${key} RETURNING key
    `;
    return rows.length > 0;
  }

  async clear(): Promise<void> {
    await ensureSchema();
    const db = getSql();
    await db`DELETE FROM vrchat_keyv`;
  }
}

let client: VRChat | null = null;

function appContact(): string {
  const contact =
    process.env.VRCHAT_CONTACT?.trim() ||
    process.env.VRCHAT_USER_AGENT?.match(/\S+@\S+\.\S+|https?:\/\/\S+/i)?.[0];
  if (!contact) {
    throw new Error("Set VRCHAT_CONTACT (email or URL) for the vrchat SDK");
  }
  if (/example\.(com|org|net)/i.test(contact)) {
    throw new Error("VRCHAT_CONTACT must be a real contact, not a placeholder");
  }
  return contact;
}

function isCurrentUser(
  data: unknown,
): data is { id: string; displayName: string } {
  return (
    !!data &&
    typeof data === "object" &&
    "id" in data &&
    "displayName" in data &&
    typeof (data as { id: unknown }).id === "string"
  );
}

function isTwoFactorRequired(
  data: unknown,
): data is { requiresTwoFactorAuth: string[] } {
  return (
    !!data &&
    typeof data === "object" &&
    Array.isArray((data as { requiresTwoFactorAuth?: unknown }).requiresTwoFactorAuth)
  );
}

export async function getVrchat(): Promise<VRChat> {
  if (client) return client;
  await ensureSchema();
  client = new VRChat({
    application: {
      name: "VRChatQuickLookup",
      version: process.env.npm_package_version || "0.3.0",
      contact: appContact(),
    },
    // Pass adapter directly (avoids duplicate Keyv type identity issues).
    keyv: new NeonKeyvStore() as never,
    authentication: {
      optimistic: false,
    },
  });
  return client;
}

export async function vrchatStatus(): Promise<{
  connected: boolean;
  displayName?: string;
  userId?: string;
  error?: string;
}> {
  try {
    const vrchat = await getVrchat();
    const { data } = await vrchat.getCurrentUser({ throwOnError: true });
    if (!isCurrentUser(data)) {
      return { connected: false, error: "Not authenticated" };
    }
    return {
      connected: true,
      displayName: data.displayName,
      userId: data.id,
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Not connected",
    };
  }
}

class TwoFactorNeededError extends Error {
  methods: string[];
  constructor(methods: string[] = ["totp"]) {
    super("TWO_FACTOR_REQUIRED");
    this.methods = methods;
  }
}

export async function vrchatLogin(params: {
  username: string;
  password: string;
  twoFactorCode?: string;
}): Promise<
  | { status: "ok"; displayName: string; userId: string }
  | { status: "twoFactorRequired"; methods: string[] }
> {
  const vrchat = await getVrchat();

  try {
    const result = await vrchat.login({
      username: params.username,
      password: params.password,
      twoFactorCode: async () => {
        if (params.twoFactorCode?.trim()) return params.twoFactorCode.trim();
        throw new TwoFactorNeededError(["totp", "otp", "emailOtp"]);
      },
      throwOnError: true,
    });
    const data = result.data;
    if (isTwoFactorRequired(data)) {
      return {
        status: "twoFactorRequired",
        methods: data.requiresTwoFactorAuth,
      };
    }
    if (!isCurrentUser(data)) {
      throw new Error("Unexpected VRChat login response");
    }
    return {
      status: "ok",
      displayName: data.displayName,
      userId: data.id,
    };
  } catch (err) {
    if (err instanceof TwoFactorNeededError) {
      return { status: "twoFactorRequired", methods: err.methods };
    }
    throw err;
  }
}

export async function vrchatLogout(): Promise<void> {
  const vrchat = await getVrchat();
  try {
    await vrchat.logout({ throwOnError: false });
  } catch {
    // ignore
  }
  await ensureSchema();
  const db = getSql();
  await db`DELETE FROM vrchat_keyv`;
  client = null;
}

export function isVrchatError(err: unknown): err is VRChatError {
  return err instanceof VRChatError;
}
