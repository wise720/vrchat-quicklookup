import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PublicUser } from "@vrchat-quicklookup/shared";
import { apiFetch } from "../api";

function thumb(u: PublicUser) {
  return (
    u.profilePicOverride ||
    u.userIcon ||
    u.currentAvatarThumbnailImageUrl ||
    ""
  );
}

export function LookupPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
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
      const res = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        results?: PublicUser[];
        error?: string;
        code?: string;
      };
      if (res.status === 401) {
        navigate("/signin");
        return;
      }
      if (res.status === 403 && data.code === "MUST_CHANGE_PASSWORD") {
        navigate("/change-password");
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
    <main className="page">
      <h1>Lookup</h1>
      <p className="lede">
        Search by display name or paste a user ID. Warnings come from Admin filters.
      </p>
      <form onSubmit={onSearch} className="search-row">
        <input
          placeholder="Display name or usr_…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={busy || !query.trim()}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {searched && !busy && !error && results.length === 0 && (
        <p className="muted">No users found.</p>
      )}
      <ul className="result-list">
        {results.map((u) => (
          <li key={u.id}>
            <Link to={`/user/${encodeURIComponent(u.id)}`} className="result-card">
              {thumb(u) ? (
                <img src={thumb(u)} alt="" />
              ) : (
                <div className="avatar-fallback" />
              )}
              <div>
                <strong>{u.displayName}</strong>
                <div className="muted mono">{u.id}</div>
                {u.statusDescription && (
                  <div className="muted">{u.statusDescription}</div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
