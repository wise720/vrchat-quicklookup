import type { LookupResult, PublicUser } from "@vrchat-quicklookup/shared";
import { cacheTtlMs, getCache, loadFilterConfig, setCache } from "./db.js";
import { runChecks } from "./checks.js";
import { getVrchat, isVrchatError } from "./vrchat.js";

function publicUser(user: Record<string, unknown>): PublicUser {
  return {
    id: String(user.id),
    displayName: String(user.displayName ?? ""),
    bio: (user.bio as string) ?? "",
    bioLinks: (user.bioLinks as string[]) ?? [],
    status: user.status as string | undefined,
    statusDescription: user.statusDescription as string | undefined,
    tags: (user.tags as string[]) ?? [],
    date_joined: user.date_joined as string | undefined,
    last_login: user.last_login as string | undefined,
    last_platform: user.last_platform as string | undefined,
    pronouns: user.pronouns as string | undefined,
    isFriend: user.isFriend as boolean | undefined,
    developerType: user.developerType as string | undefined,
    currentAvatarThumbnailImageUrl:
      user.currentAvatarThumbnailImageUrl as string | undefined,
    currentAvatarImageUrl: user.currentAvatarImageUrl as string | undefined,
    userIcon: user.userIcon as string | undefined,
    profilePicOverride: user.profilePicOverride as string | undefined,
  };
}

function looksLikeUserId(query: string): boolean {
  const q = query.trim();
  return (
    /^usr_[0-9a-f-]{36}$/i.test(q) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)
  );
}

async function requireVrchat() {
  const vrchat = await getVrchat();
  try {
    await vrchat.getCurrentUser({ throwOnError: true });
  } catch (err) {
    if (isVrchatError(err) && err.statusCode === 401) {
      throw Object.assign(
        new Error("Owner must sign into VRChat in Admin first"),
        { status: 503 },
      );
    }
    throw err;
  }
  return vrchat;
}

export async function searchUsers(query: string) {
  const q = query.trim();
  if (!q) throw Object.assign(new Error("Query q is required"), { status: 400 });

  const vrchat = await requireVrchat();

  if (looksLikeUserId(q)) {
    const { data } = await vrchat.getUser({
      throwOnError: true,
      path: { userId: q },
    });
    return { results: [publicUser(data as never)] };
  }

  const { data } = await vrchat.searchUsers({
    throwOnError: true,
    query: { search: q, n: 30 },
  });
  const list = Array.isArray(data) ? data : [];
  return { results: list.map((u) => publicUser(u as never)) };
}

export async function lookupUser(
  userId: string,
  opts: { bypassCache?: boolean } = {},
): Promise<LookupResult> {
  const cacheKey = `user:${userId}`;
  if (!opts.bypassCache) {
    const cached = await getCache(cacheKey);
    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age >= 0 && age < cacheTtlMs()) {
        const payload = cached.payload as LookupResult;
        return {
          ...payload,
          fromCache: true,
          cachedAt: cached.fetched_at,
        };
      }
    }
  }

  const vrchat = await requireVrchat();
  const [{ data: user }, groupsRes, config] = await Promise.all([
    vrchat.getUser({ throwOnError: true, path: { userId } }),
    vrchat.getUserGroups({ throwOnError: true, path: { userId } }),
    loadFilterConfig(),
  ]);

  const groupsRaw = Array.isArray(groupsRes.data) ? groupsRes.data : [];
  const groups = groupsRaw.map((g) => {
    const row = g as Record<string, unknown>;
    return {
      groupId: String(row.groupId ?? row.id ?? ""),
      name: String(row.name ?? ""),
      shortCode: row.shortCode as string | undefined,
      discriminator: row.discriminator as string | undefined,
      iconUrl: row.iconUrl as string | undefined,
      memberCount: row.memberCount as number | undefined,
      privacy: row.privacy as string | undefined,
      isRepresenting: row.isRepresenting as boolean | undefined,
    };
  });

  const warnings = await runChecks({
    user: user as never,
    groups: groupsRaw as never,
    config,
  });

  const result: LookupResult = {
    user: publicUser(user as never),
    groups,
    warnings,
    profileUrl: `https://vrchat.com/home/user/${encodeURIComponent(String((user as { id: string }).id))}`,
    cachedAt: new Date().toISOString(),
    fromCache: false,
  };

  await setCache(cacheKey, result);
  return result;
}

export async function searchGroups(query: string) {
  const q = query.trim();
  if (!q) throw Object.assign(new Error("Provide q"), { status: 400 });
  const vrchat = await requireVrchat();

  if (/^grp_[0-9a-f-]{36}$/i.test(q)) {
    const { data } = await vrchat.getGroup({
      throwOnError: true,
      path: { groupId: q },
    });
    const g = data as Record<string, unknown>;
    return {
      groups: [
        {
          id: String(g.id),
          name: String(g.name ?? ""),
          shortCode: g.shortCode as string | undefined,
          discriminator: g.discriminator as string | undefined,
          memberCount: g.memberCount as number | undefined,
          iconUrl: g.iconUrl as string | undefined,
        },
      ],
    };
  }

  const { data } = await vrchat.searchGroups({
    throwOnError: true,
    query: { query: q, n: 10 },
  });
  const list = Array.isArray(data) ? data : [];
  return {
    groups: list.slice(0, 10).map((g) => {
      const row = g as Record<string, unknown>;
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        shortCode: row.shortCode as string | undefined,
        discriminator: row.discriminator as string | undefined,
        memberCount: row.memberCount as number | undefined,
        iconUrl: row.iconUrl as string | undefined,
      };
    }),
  };
}
