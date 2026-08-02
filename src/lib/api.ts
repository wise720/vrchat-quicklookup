import { NextResponse } from "next/server";
import { VrchatApiError, VrchatAuthError } from "@/lib/vrchat/client";

export function jsonError(err: unknown, fallback = "Unexpected error") {
  if (err instanceof VrchatAuthError) {
    return NextResponse.json(
      { error: err.message, code: "auth_required" },
      { status: 401 },
    );
  }
  if (err instanceof VrchatApiError) {
    return NextResponse.json(
      { error: err.message, code: "vrchat_error" },
      { status: err.status },
    );
  }
  if (err instanceof Error) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export function publicUser(user: {
  id: string;
  displayName: string;
  currentAvatarThumbnailImageUrl?: string;
  currentAvatarImageUrl?: string;
  userIcon?: string;
  profilePicOverride?: string;
  [key: string]: unknown;
}) {
  return {
    id: user.id,
    displayName: user.displayName,
    bio: user.bio ?? "",
    bioLinks: user.bioLinks ?? [],
    status: user.status,
    statusDescription: user.statusDescription,
    tags: user.tags ?? [],
    date_joined: user.date_joined,
    last_login: user.last_login,
    last_platform: user.last_platform,
    pronouns: user.pronouns,
    isFriend: user.isFriend,
    developerType: user.developerType,
    currentAvatarThumbnailImageUrl: user.currentAvatarThumbnailImageUrl,
    currentAvatarImageUrl: user.currentAvatarImageUrl,
    userIcon: user.userIcon,
    profilePicOverride: user.profilePicOverride,
  };
}
