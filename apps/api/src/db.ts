import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import {
  DEFAULT_FILTER_CONFIG,
  type FilterConfig,
  type Role,
} from "@vrchat-quicklookup/shared";

let sql: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

export function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL is not set");
    sql = neon(url);
  }
  return sql;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getSql();
      await db`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
      await db`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'user')),
          must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS filter_config (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          config JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS vrchat_keyv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS lookup_cache (
          cache_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await db`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_original_owner BOOLEAN NOT NULL DEFAULT FALSE
      `;
      // Backfill: mark the earliest owner as original if none is set yet.
      await db`
        UPDATE users
        SET is_original_owner = TRUE
        WHERE id = (
          SELECT id FROM users
          WHERE role = 'owner'
          ORDER BY created_at ASC
          LIMIT 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM users WHERE is_original_owner = TRUE
        )
      `;
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  must_change_password: boolean;
  is_original_owner: boolean;
  created_at: string;
};

function normalizeGroupList(list: unknown) {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Array<{ id: string; name?: string }> = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as { id?: string }).id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = (item as { name?: string }).name;
    out.push({
      id,
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
    });
  }
  return out;
}

export function mergeFilterConfig(raw: unknown): FilterConfig {
  const base = structuredClone(DEFAULT_FILTER_CONFIG);
  if (!raw || typeof raw !== "object") return base;
  const checks = (raw as Partial<FilterConfig>).checks ?? {};
  for (const [id, value] of Object.entries(checks)) {
    if (!value || typeof value !== "object") continue;
    const existing = base.checks[id] ?? { enabled: true };
    base.checks[id] = {
      ...existing,
      ...value,
      enabled:
        typeof (value as { enabled?: unknown }).enabled === "boolean"
          ? (value as { enabled: boolean }).enabled
          : existing.enabled !== false,
    } as FilterConfig["checks"][string];
  }
  const groups = base.checks.groups;
  groups.warnGroups = normalizeGroupList(groups.warnGroups);
  groups.problemGroups = normalizeGroupList(groups.problemGroups);
  const na = base.checks["new-account"];
  if (typeof na.maxAgeDays !== "number" || na.maxAgeDays < 0) na.maxAgeDays = 7;
  return base;
}

export async function loadFilterConfig(): Promise<FilterConfig> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`SELECT config FROM filter_config WHERE id = 1 LIMIT 1`;
  if (!rows[0]) {
    const defaults = structuredClone(DEFAULT_FILTER_CONFIG);
    await saveFilterConfig(defaults);
    return defaults;
  }
  let raw: unknown = rows[0].config;
  // Defend against accidental double-encoded JSON strings in the column.
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  return mergeFilterConfig(raw);
}

export async function saveFilterConfig(config: FilterConfig): Promise<void> {
  await ensureSchema();
  const normalized = mergeFilterConfig(config);
  const payload = JSON.stringify(normalized);
  const db = getSql();
  await db`
    INSERT INTO filter_config (id, config, updated_at)
    VALUES (1, ${payload}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE
    SET config = EXCLUDED.config, updated_at = NOW()
  `;
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    SELECT id, email, password_hash, role, must_change_password, is_original_owner, created_at
    FROM users WHERE lower(email) = lower(${email}) LIMIT 1
  `;
  return (rows[0] as DbUser | undefined) ?? null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    SELECT id, email, password_hash, role, must_change_password, is_original_owner, created_at
    FROM users WHERE id = ${id}::uuid LIMIT 1
  `;
  return (rows[0] as DbUser | undefined) ?? null;
}

export async function listUsers(): Promise<
  Array<Omit<DbUser, "password_hash">>
> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    SELECT id, email, role, must_change_password, is_original_owner, created_at
    FROM users ORDER BY created_at ASC
  `;
  return rows as Array<Omit<DbUser, "password_hash">>;
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  role: Role;
  mustChangePassword: boolean;
  isOriginalOwner?: boolean;
}): Promise<DbUser> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    INSERT INTO users (email, password_hash, role, must_change_password, is_original_owner)
    VALUES (
      ${params.email.toLowerCase()},
      ${params.passwordHash},
      ${params.role},
      ${params.mustChangePassword},
      ${params.isOriginalOwner === true}
    )
    RETURNING id, email, password_hash, role, must_change_password, is_original_owner, created_at
  `;
  return rows[0] as DbUser;
}

export async function countOwners(): Promise<number> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    SELECT COUNT(*)::int AS count FROM users WHERE role = 'owner'
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function deleteUserById(userId: string): Promise<boolean> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    DELETE FROM users WHERE id = ${userId}::uuid RETURNING id
  `;
  return rows.length > 0;
}

export async function updatePassword(
  userId: string,
  passwordHash: string,
  mustChangePassword: boolean,
): Promise<void> {
  await ensureSchema();
  const db = getSql();
  await db`
    UPDATE users
    SET password_hash = ${passwordHash},
        must_change_password = ${mustChangePassword}
    WHERE id = ${userId}::uuid
  `;
}

export async function getCache(cacheKey: string): Promise<{
  payload: unknown;
  fetched_at: string;
} | null> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    SELECT payload, fetched_at FROM lookup_cache WHERE cache_key = ${cacheKey} LIMIT 1
  `;
  if (!rows[0]) return null;
  let payload: unknown = rows[0].payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      // keep string
    }
  }
  return {
    payload,
    fetched_at: String(rows[0].fetched_at),
  };
}

export async function setCache(cacheKey: string, payload: unknown): Promise<void> {
  await ensureSchema();
  const db = getSql();
  const json = JSON.stringify(payload);
  await db`
    INSERT INTO lookup_cache (cache_key, payload, fetched_at)
    VALUES (${cacheKey}, ${json}::jsonb, NOW())
    ON CONFLICT (cache_key) DO UPDATE
    SET payload = EXCLUDED.payload, fetched_at = NOW()
  `;
}

export function cacheTtlMs(): number {
  const seconds = Number(process.env.LOOKUP_CACHE_TTL_SECONDS ?? 604800);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 604800) * 1000;
}
