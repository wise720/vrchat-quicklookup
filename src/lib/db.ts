import { neon } from "@neondatabase/serverless";
import {
  DEFAULT_FILTER_CONFIG,
  mergeConfig,
  type FilterConfig,
} from "@/lib/filters/schema";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a free Neon database and paste the connection string.",
    );
  }
  return url;
}

function sql() {
  return neon(databaseUrl());
}

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = sql();
      await db`
        CREATE TABLE IF NOT EXISTS filter_config (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          config JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS admin_users (
          vrchat_user_id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export async function loadFilterConfig(): Promise<FilterConfig> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT config FROM filter_config WHERE id = 1 LIMIT 1`;
  if (!rows[0]) {
    const defaults = structuredClone(DEFAULT_FILTER_CONFIG);
    await saveFilterConfig(defaults);
    return defaults;
  }
  return mergeConfig(rows[0].config);
}

export async function saveFilterConfig(config: FilterConfig): Promise<void> {
  await ensureSchema();
  const normalized = mergeConfig(config);
  const db = sql();
  await db`
    INSERT INTO filter_config (id, config, updated_at)
    VALUES (1, ${normalized as never}, NOW())
    ON CONFLICT (id) DO UPDATE
    SET config = EXCLUDED.config, updated_at = NOW()
  `;
}

export async function listAdminUserIds(): Promise<string[]> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT vrchat_user_id FROM admin_users ORDER BY created_at`;
  const fromDb = rows.map((r) => String(r.vrchat_user_id));

  const fromEnv = (process.env.ADMIN_VRCHAT_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return [...new Set([...fromDb, ...fromEnv])];
}

export async function isAdminUserId(userId: string): Promise<boolean> {
  const admins = await listAdminUserIds();
  return admins.includes(userId);
}

export async function seedAdminUser(userId: string): Promise<void> {
  const id = userId.trim();
  if (!id) throw new Error("VRChat user id is required");
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO admin_users (vrchat_user_id)
    VALUES (${id})
    ON CONFLICT (vrchat_user_id) DO NOTHING
  `;
}
