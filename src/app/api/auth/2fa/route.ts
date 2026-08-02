import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { verifyTwoFactor } from "@/lib/vrchat/client";
import {
  clearPendingTwoFactor,
  loadPendingTwoFactor,
} from "@/lib/vrchat/pending-2fa";
import type { TwoFactorMethod } from "@/lib/vrchat/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      method?: TwoFactorMethod;
    };

    const pending = await loadPendingTwoFactor();
    if (!pending) {
      return NextResponse.json(
        { error: "No pending two-factor login. Sign in again." },
        { status: 400 },
      );
    }

    const code = body.code?.trim() ?? "";
    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const method =
      body.method && pending.methods.includes(body.method)
        ? body.method
        : pending.methods[0];

    if (!method) {
      return NextResponse.json(
        { error: "No two-factor method available" },
        { status: 400 },
      );
    }

    const user = await verifyTwoFactor({
      authCookie: pending.authCookie,
      code,
      method,
    });

    await clearPendingTwoFactor();

    return NextResponse.json({
      status: "ok",
      user: publicUser(user),
    });
  } catch (err) {
    return jsonError(err, "Two-factor verification failed");
  }
}
