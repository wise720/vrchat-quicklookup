import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { isAdminUserId } from "@/lib/db";
import { getCurrentUser } from "@/lib/vrchat/client";
import { requireSessionFromRequest } from "@/lib/vrchat/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requireSessionFromRequest(request);
    const user = await getCurrentUser(session);
    const isAdmin = await isAdminUserId(user.id);
    return NextResponse.json({
      user: publicUser(user),
      isAdmin,
    });
  } catch (err) {
    return jsonError(err, "Not signed in");
  }
}
