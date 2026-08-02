import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { loginWithPassword } from "@/lib/vrchat/client";

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
      return NextResponse.json({
        status: "twoFactorRequired",
        methods: result.methods,
        pendingAuthCookie: result.pendingAuthCookie,
      });
    }

    return NextResponse.json({
      status: "ok",
      user: publicUser(result.user),
      session: result.session,
    });
  } catch (err) {
    return jsonError(err, "Login failed");
  }
}
