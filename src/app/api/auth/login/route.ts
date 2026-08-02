import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { loginWithPassword } from "@/lib/vrchat/client";

export const runtime = "nodejs";

const PENDING_COOKIE = "vrc_pending_auth";

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
      const res = NextResponse.json({
        status: "twoFactorRequired",
        methods: result.methods,
        pendingAuthCookie: result.pendingAuthCookie,
      });
      res.cookies.set(PENDING_COOKIE, result.pendingAuthCookie, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      });
      return res;
    }

    const res = NextResponse.json({
      status: "ok",
      user: publicUser(result.user),
      session: result.session,
    });
    res.cookies.delete(PENDING_COOKIE);
    return res;
  } catch (err) {
    return jsonError(err, "Login failed");
  }
}
