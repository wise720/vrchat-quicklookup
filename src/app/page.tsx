"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/require-auth";
import { apiFetch } from "@/lib/client/session";

type SearchUser = {
  id: string;
  displayName: string;
  status?: string;
  statusDescription?: string;
  currentAvatarThumbnailImageUrl?: string;
  profilePicOverride?: string;
  userIcon?: string;
};

function thumb(u: SearchUser) {
  return u.profilePicOverride || u.userIcon || u.currentAvatarThumbnailImageUrl || "";
}

function LookupPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setBusy(true);
    setError(null);
    setSearched(true);
    try {
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        results?: SearchUser[];
        error?: string;
        code?: string;
      };
      if (res.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results ?? []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
        Lookup
      </h1>
      <p className="mt-2 max-w-xl text-[var(--muted)]">
        Search by display name or paste a user ID. Warnings come from Admin-configured filters.
      </p>

      <form onSubmit={onSearch} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          placeholder="Display name or usr_…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-md bg-[var(--accent)] px-5 py-2.5 font-medium text-[var(--accent-ink)] disabled:opacity-60"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-[var(--problem)]">{error}</p>}

      <div className="mt-8 flex flex-col gap-2">
        {searched && !busy && results.length === 0 && !error && (
          <p className="text-[var(--muted)]">No users found.</p>
        )}
        {results.map((user) => (
          <Link
            key={user.id}
            href={`/user/${encodeURIComponent(user.id)}`}
            className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 transition hover:border-[var(--accent)]"
          >
            {thumb(user) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb(user)}
                alt=""
                className="h-12 w-12 rounded-md object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-md bg-[var(--border)]" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-[var(--ink)]">
                {user.displayName}
              </div>
              <div className="truncate text-sm text-[var(--muted)]">
                {user.statusDescription || user.status || user.id}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <LookupPage />
    </RequireAuth>
  );
}
