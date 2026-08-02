import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { verifyTwoFactor } from "@/lib/vrchat/client";
import type { TwoFactorMethod } from "@/lib/vrchat/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      method?: TwoFactorMethod;
      pendingAuthCookie?: string;
    };

    const authCookie = body.pendingAuthCookie?.trim() ?? "";
    const code = body.code?.trim() ?? "";
    if (!authCookie) {
      return NextResponse.json(
        { error: "Missing pending auth cookie — sign in again" },
        { status: 400 },
      );
    }
    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const method = body.method ?? "totp";
    const { user, session } = await verifyTwoFactor({
      authCookie,
      code,
      method,
    });

    return NextResponse.json({
      status: "ok",
      user: publicUser(user),
      session,
    });
  } catch (err) {
    return jsonError(err, "Two-factor verification failed");
  }
}
