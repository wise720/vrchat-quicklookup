import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import {
  loginWithPasswordAndTwoFactor,
  normalizeTwoFactorMethod,
} from "@/lib/vrchat/client";
import type { TwoFactorMethod } from "@/lib/vrchat/types";

export const runtime = "nodejs";

/**
 * Completes 2FA by re-doing password login + TOTP in one serverless invocation.
 * Reusing a pending auth cookie from a previous request often fails on Vercel
 * (VRChat returns 401 Missing Credentials) due to different egress IPs.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      method?: TwoFactorMethod | string;
      username?: string;
      password?: string;
      pendingAuthCookie?: string;
    };

    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";
    const code = body.code?.trim() ?? "";
    const method = normalizeTwoFactorMethod(body.method);

    if (!username || !password) {
      return NextResponse.json(
        {
          error:
            "Username and password are required for 2FA on this host. Go back and sign in again.",
        },
        { status: 400 },
      );
    }
    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }
    if (method === "totp" && !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Authenticator codes are 6 digits" },
        { status: 400 },
      );
    }

    const { user, session } = await loginWithPasswordAndTwoFactor({
      username,
      password,
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
