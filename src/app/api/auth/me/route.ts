import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { getCurrentUser } from "@/lib/vrchat/client";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user: publicUser(user) });
  } catch (err) {
    return jsonError(err, "Not signed in");
  }
}
