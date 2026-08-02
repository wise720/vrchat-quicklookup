import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { logout } from "@/lib/vrchat/client";
import { clearPendingTwoFactor } from "@/lib/vrchat/pending-2fa";

export async function POST() {
  try {
    await logout();
    await clearPendingTwoFactor();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, "Logout failed");
  }
}
