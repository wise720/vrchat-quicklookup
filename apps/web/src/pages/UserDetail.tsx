import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LookupResult, Severity } from "@vrchat-quicklookup/shared";
import { apiFetch } from "../api";

function avatar(u: LookupResult["user"]) {
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

function Badges({
  warnings,
}: {
  warnings: Array<{ id: string; severity: Severity; label: string; detail?: string }>;
}) {
  if (!warnings.length) {
    return <p className="muted">No warnings from current filters.</p>;
  }
  return (
    <ul className="badges">
      {warnings.map((w) => (
        <li key={w.id} className={w.severity === "problem" ? "badge problem" : "badge warn"} title={w.detail}>
          {w.label}
        </li>
      ))}
    </ul>
  );
}

export function UserDetailPage() {
  const { userId: raw } = useParams();
  const userId = decodeURIComponent(raw ?? "");
  const navigate = useNavigate();
  const [data, setData] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load(bypass = false) {
    if (bypass) setRefreshing(true);
    else setBusy(true);
    setError(null);
    try {
      const path = bypass
        ? `/users/${encodeURIComponent(userId)}/refresh`
        : `/users/${encodeURIComponent(userId)}`;
      const res = await apiFetch(path, bypass ? { method: "POST" } : undefined);
      const json = (await res.json()) as LookupResult & {
        error?: string;
        code?: string;
      };
      if (res.status === 401) {
        navigate("/signin");
        return;
      }
      if (res.status === 403 && json.code === "MUST_CHANGE_PASSWORD") {
        navigate("/change-password");
        return;
      }
      if (!res.ok) throw new Error(json.error || "Lookup failed");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function copyId() {
    if (!data) return;
    await navigator.clipboard.writeText(data.user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="page">
      <Link to="/" className="back">
        ← Back to search
      </Link>

      {busy && <p className="muted">Loading user…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="profile-head">
            {avatar(data.user) ? (
              <img className="profile-avatar" src={avatar(data.user)} alt="" />
            ) : (
              <div className="profile-avatar fallback" />
            )}
            <div>
              <h1>{data.user.displayName}</h1>
              <p className="mono muted">{data.user.id}</p>
              <div className="actions">
                <button type="button" onClick={copyId}>
                  {copied ? "Copied" : "Copy ID"}
                </button>
                <a href={data.profileUrl} target="_blank" rel="noreferrer">
                  Open on VRChat
                </a>
                <button
                  type="button"
                  onClick={() => void load(true)}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              <p className="muted small">
                {data.fromCache
                  ? `Cached ${data.cachedAt ? new Date(data.cachedAt).toLocaleString() : ""}`
                  : `Fetched ${data.cachedAt ? new Date(data.cachedAt).toLocaleString() : "just now"}`}
              </p>
            </div>
          </div>

          <section className="section">
            <h2>Warnings</h2>
            <Badges warnings={data.warnings} />
          </section>

          <section className="section">
            <h2>Profile</h2>
            <dl className="meta">
              <div>
                <dt>Status</dt>
                <dd>
                  {data.user.status ?? "—"}
                  {data.user.statusDescription
                    ? ` — ${data.user.statusDescription}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Trust</dt>
                <dd>{trustFromTags(data.user.tags)}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{data.user.date_joined ?? "—"}</dd>
              </div>
              <div>
                <dt>Last login</dt>
                <dd>{data.user.last_login ?? "—"}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{data.user.last_platform ?? "—"}</dd>
              </div>
              <div>
                <dt>Pronouns</dt>
                <dd>{data.user.pronouns || "—"}</dd>
              </div>
            </dl>
            {data.user.bio && (
              <pre className="bio">{data.user.bio}</pre>
            )}
          </section>

          <section className="section">
            <h2>Groups ({data.groups.length})</h2>
            {data.groups.length === 0 ? (
              <p className="muted">No public groups.</p>
            ) : (
              <ul className="group-list">
                {data.groups.map((g) => (
                  <li key={g.groupId}>
                    {g.iconUrl && <img src={g.iconUrl} alt="" />}
                    <div>
                      <strong>{g.name}</strong>
                      <div className="muted mono">{g.groupId}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
