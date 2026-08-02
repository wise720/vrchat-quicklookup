import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import {
  normalizeTwoFactorMethod,
  verifyTwoFactor,
} from "@/lib/vrchat/client";
import type { TwoFactorMethod } from "@/lib/vrchat/types";

export const runtime = "nodejs";

const PENDING_COOKIE = "vrc_pending_auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      method?: TwoFactorMethod | string;
      pendingAuthCookie?: string;
    };

    const jar = await cookies();
    const authCookie =
      body.pendingAuthCookie?.trim() ||
      jar.get(PENDING_COOKIE)?.value?.trim() ||
      "";
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

    const method = normalizeTwoFactorMethod(body.method);
    const { user, session } = await verifyTwoFactor({
      authCookie,
      code,
      method,
    });

    const res = NextResponse.json({
      status: "ok",
      user: publicUser(user),
      session,
    });
    res.cookies.delete(PENDING_COOKIE);
    return res;
  } catch (err) {
    return jsonError(err, "Two-factor verification failed");
  }
}
