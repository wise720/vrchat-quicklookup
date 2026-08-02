import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { isAdminUserId } from "@/lib/db";
import { getCurrentUser, getGroup, searchGroups } from "@/lib/vrchat/client";
import { requireSessionFromRequest } from "@/lib/vrchat/session";

async function requireAdmin(request: Request) {
  const session = requireSessionFromRequest(request);
  const user = await getCurrentUser(session);
  if (!(await isAdminUserId(user.id))) {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if ("error" in admin) return admin.error;
    const { session } = admin;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const id = searchParams.get("id")?.trim() ?? "";

    if (id || /^grp_[0-9a-f-]{36}$/i.test(q)) {
      const groupId = id || q;
      const group = await getGroup(session, groupId);
      return NextResponse.json({
        groups: [
          {
            id: group.id,
            name: group.name,
            shortCode: group.shortCode,
            discriminator: group.discriminator,
            memberCount: group.memberCount,
            iconUrl: group.iconUrl,
          },
        ],
      });
    }

    if (!q) {
      return NextResponse.json(
        { error: "Provide q (search) or id" },
        { status: 400 },
      );
    }

    const groups = await searchGroups(session, q, 25);
    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        shortCode: g.shortCode,
        discriminator: g.discriminator,
        memberCount: g.memberCount,
        iconUrl: g.iconUrl,
      })),
    });
  } catch (err) {
    return jsonError(err, "Group search failed");
  }
}
