import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getGroup, searchGroups } from "@/lib/vrchat/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const id = searchParams.get("id")?.trim() ?? "";

    if (id) {
      const group = await getGroup(id);
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

    // Direct id paste as query
    if (/^grp_[0-9a-f-]{36}$/i.test(q)) {
      const group = await getGroup(q);
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

    const groups = await searchGroups(q, 25);
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
