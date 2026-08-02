"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/require-auth";
import { WarningBadges } from "@/components/warning-badges";
import { apiFetch } from "@/lib/client/session";
import type { VrchatSeverity } from "@/lib/vrchat/types";

type LookupResponse = {
  user: {
    id: string;
    displayName: string;
    bio?: string;
    bioLinks?: string[];
    status?: string;
    statusDescription?: string;
    tags?: string[];
    date_joined?: string;
    last_login?: string;
    last_platform?: string;
    pronouns?: string;
    isFriend?: boolean;
    currentAvatarThumbnailImageUrl?: string;
    currentAvatarImageUrl?: string;
    userIcon?: string;
    profilePicOverride?: string;
  };
  groups: Array<{
    groupId: string;
    name: string;
    shortCode?: string;
    discriminator?: string;
    iconUrl?: string;
    memberCount?: number;
    privacy?: string;
  }>;
  warnings: Array<{
    id: string;
    severity: VrchatSeverity;
    label: string;
    detail?: string;
  }>;
  profileUrl: string;
};

function avatar(u: LookupResponse["user"]) {
  return (
    u.profilePicOverride ||
    u.userIcon ||
    u.currentAvatarImageUrl ||
    u.currentAvatarThumbnailImageUrl ||
    ""
  );
}

function trustFromTags(tags: string[] = []): string {
  const trust = tags.find((t) => t.startsWith("system_trust_"));
  if (!trust) return "unknown";
  return trust.replace("system_trust_", "").replace(/_/g, " ");
}

function UserDetail() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = decodeURIComponent(params.userId);
  const [data, setData] = useState<LookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/users/${encodeURIComponent(userId)}`);
        const json = (await res.json()) as LookupResponse & {
          error?: string;
          code?: string;
        };
        if (res.status === 401) {
          router.replace("/signin");
          return;
        }
        if (!res.ok) throw new Error(json.error || "Lookup failed");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Lookup failed");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  async function copyId() {
    if (!data) return;
    await navigator.clipboard.writeText(data.user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
        ← Back to search
      </Link>

      {busy && <p className="mt-8 text-[var(--muted)]">Loading user…</p>}
      {error && <p className="mt-8 text-[var(--problem)]">{error}</p>}

      {data && (
        <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
          <aside>
            {avatar(data.user) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar(data.user)}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ) : (
              <div className="aspect-square w-full rounded-lg bg-[var(--border)]" />
            )}
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <button
                type="button"
                onClick={() => void copyId()}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-left hover:border-[var(--accent)]"
              >
                {copied ? "Copied ID" : "Copy user ID"}
              </button>
              <a
                href={data.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[var(--border)] px-3 py-2 hover:border-[var(--accent)]"
              >
                Open on VRChat
              </a>
            </div>
          </aside>

          <div className="flex flex-col gap-8">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
                {data.user.displayName}
              </h1>
              <p className="mt-1 font-mono text-sm text-[var(--muted)]">
                {data.user.id}
              </p>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--muted)]">Status</dt>
                  <dd>
                    {data.user.statusDescription || data.user.status || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Trust</dt>
                  <dd>{trustFromTags(data.user.tags)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Joined</dt>
                  <dd>
                    {data.user.date_joined
                      ? new Date(data.user.date_joined).toLocaleDateString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Platform</dt>
                  <dd>{data.user.last_platform || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Pronouns</dt>
                  <dd>{data.user.pronouns || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Friend</dt>
                  <dd>{data.user.isFriend ? "Yes" : "No"}</dd>
                </div>
              </dl>
            </div>

            <section>
              <h2 className="text-lg font-medium text-[var(--ink)]">Warnings</h2>
              <div className="mt-3">
                <WarningBadges warnings={data.warnings} />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium text-[var(--ink)]">Bio</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink)]">
                {data.user.bio?.trim() || "—"}
              </p>
              {!!data.user.bioLinks?.length && (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {data.user.bioLinks.map((link) => (
                    <li key={link}>
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-medium text-[var(--ink)]">
                Groups ({data.groups.length})
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {data.groups.length === 0 && (
                  <li className="text-sm text-[var(--muted)]">No public groups.</li>
                )}
                {data.groups.map((g) => (
                  <li
                    key={g.groupId}
                    className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2"
                  >
                    {g.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.iconUrl}
                        alt=""
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-[var(--border)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[var(--ink)]">{g.name}</div>
                      <div className="truncate font-mono text-xs text-[var(--muted)]">
                        {g.groupId}
                        {g.shortCode ? ` · ${g.shortCode}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <UserDetail />
    </RequireAuth>
  );
}
