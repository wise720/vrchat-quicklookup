import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listChecks } from "@/lib/checks";
import "@/lib/checks";
import { isAdminUserId, loadFilterConfig, saveFilterConfig } from "@/lib/db";
import type { FilterConfig } from "@/lib/filters/schema";
import { getCurrentUser } from "@/lib/vrchat/client";
import { requireSessionFromRequest } from "@/lib/vrchat/session";

async function requireAdmin(request: Request) {
  const session = requireSessionFromRequest(request);
  const user = await getCurrentUser(session);
  if (!(await isAdminUserId(user.id))) {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { session, user };
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if ("error" in admin) return admin.error;

    const config = await loadFilterConfig();
    const checks = listChecks().map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      enabled: config.checks[c.id]?.enabled !== false,
      settings: config.checks[c.id] ?? { enabled: true },
    }));

    return NextResponse.json({ config, checks });
  } catch (err) {
    return jsonError(err, "Failed to load filters");
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if ("error" in admin) return admin.error;

    const body = (await request.json()) as { config?: FilterConfig };
    if (!body.config || typeof body.config !== "object") {
      return NextResponse.json({ error: "config is required" }, { status: 400 });
    }

    await saveFilterConfig(body.config);
    const config = await loadFilterConfig();
    return NextResponse.json({ config });
  } catch (err) {
    return jsonError(err, "Failed to save filters");
  }
}
