import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { loginWithPassword } from "@/lib/vrchat/client";
import { clearPendingTwoFactor, savePendingTwoFactor } from "@/lib/vrchat/pending-2fa";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const result = await loginWithPassword(username, password);

    if (result.status === "twoFactorRequired") {
      await savePendingTwoFactor({
        authCookie: result.pendingAuthCookie!,
        methods: result.methods,
      });
      return NextResponse.json({
        status: "twoFactorRequired",
        methods: result.methods,
      });
    }

    await clearPendingTwoFactor();
    return NextResponse.json({
      status: "ok",
      user: publicUser(result.user),
    });
  } catch (err) {
    return jsonError(err, "Login failed");
  }
}
