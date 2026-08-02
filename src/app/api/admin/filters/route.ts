import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listChecks } from "@/lib/checks";
import "@/lib/checks";
import {
  loadFilterConfig,
  saveFilterConfig,
  type FilterConfig,
} from "@/lib/filters/config";
import { getCurrentUser } from "@/lib/vrchat/client";

async function requireAuth() {
  await getCurrentUser();
}

export async function GET() {
  try {
    await requireAuth();
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
    await requireAuth();
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
