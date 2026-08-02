#!/usr/bin/env node
/**
 * Seed an admin VRChat user id into Neon.
 * Usage: node --env-file=.env.local scripts/seed-admin.mjs usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
import { neon } from "@neondatabase/serverless";

const userId = process.argv[2]?.trim();
if (!userId) {
  console.error(
    "Usage: node --env-file=.env.local scripts/seed-admin.mjs <vrchat_user_id>",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS admin_users (
    vrchat_user_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

await sql`
  INSERT INTO admin_users (vrchat_user_id)
  VALUES (${userId})
  ON CONFLICT (vrchat_user_id) DO NOTHING
`;

const rows = await sql`SELECT vrchat_user_id FROM admin_users ORDER BY created_at`;
console.log("Admin users:", rows.map((r) => r.vrchat_user_id).join(", "));
