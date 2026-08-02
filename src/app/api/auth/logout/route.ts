import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { logout } from "@/lib/vrchat/client";
import { sessionFromRequest } from "@/lib/vrchat/session";

export async function POST(request: Request) {
  try {
    const session = sessionFromRequest(request);
    if (session) {
      await logout(session);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, "Logout failed");
  }
}
