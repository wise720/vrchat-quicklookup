import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import "@/lib/checks";
import { getUser, looksLikeUserId, searchUsers } from "@/lib/vrchat/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (!q) {
      return NextResponse.json({ error: "Query q is required" }, { status: 400 });
    }

    if (looksLikeUserId(q)) {
      const user = await getUser(q);
      return NextResponse.json({
        results: [publicUser(user)],
      });
    }

    const users = await searchUsers(q, 30);
    return NextResponse.json({
      results: users.map(publicUser),
    });
  } catch (err) {
    return jsonError(err, "Search failed");
  }
}
