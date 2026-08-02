import { NextResponse } from "next/server";
import { jsonError, publicUser } from "@/lib/api";
import { runChecks } from "@/lib/checks";
import "@/lib/checks";
import { loadFilterConfig } from "@/lib/filters/config";
import { getUser, getUserGroups } from "@/lib/vrchat/client";
import { requireSessionFromRequest } from "@/lib/vrchat/session";

type Params = { params: Promise<{ userId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const session = requireSessionFromRequest(request);
    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const [user, groups, config] = await Promise.all([
      getUser(session, userId),
      getUserGroups(session, userId),
      loadFilterConfig(),
    ]);

    const warnings = await runChecks({ user, groups, config });

    return NextResponse.json({
      user: publicUser(user),
      groups: groups.map((g) => ({
        groupId: g.groupId,
        name: g.name,
        shortCode: g.shortCode,
        discriminator: g.discriminator,
        iconUrl: g.iconUrl,
        memberCount: g.memberCount,
        privacy: g.privacy,
        isRepresenting: g.isRepresenting,
      })),
      warnings,
      profileUrl: `https://vrchat.com/home/user/${encodeURIComponent(user.id)}`,
    });
  } catch (err) {
    return jsonError(err, "Lookup failed");
  }
}
