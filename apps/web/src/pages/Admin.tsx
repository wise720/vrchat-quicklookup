import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type {
  AuthUser,
  FilterConfig,
  GroupListEntry,
  Role,
} from "@vrchat-quicklookup/shared";
import { apiFetch } from "../api";
import { useAuth } from "../auth";

type CheckMeta = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  settings: Record<string, unknown>;
};

type GroupHit = {
  id: string;
  name: string;
  shortCode?: string;
  discriminator?: string;
  memberCount?: number;
  iconUrl?: string;
};

type AppUserRow = {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  isOriginalOwner?: boolean;
  createdAt: string;
};

type PanelId = "filters" | "users" | "vrchat";

function IconFilters({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className={active ? "icon-active" : undefined}>
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm3 5h10v2H7v-2zm3 5h4v2h-4v-2z"
      />
    </svg>
  );
}

function IconUsers({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className={active ? "icon-active" : undefined}>
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z"
      />
    </svg>
  );
}

function IconVrchat({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className={active ? "icon-active" : undefined}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5h-2v-2h2zm0-4h-2V7h2z"
      />
    </svg>
  );
}

function PanelShell({
  title,
  onMinimize,
  children,
}: {
  title: string;
  onMinimize: () => void;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel section panel">
      <header className="admin-panel-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="minimize-btn"
          onClick={onMinimize}
          aria-label="Minimize panel"
          title="Minimize"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="currentColor" d="M5 12.5h14v2H5z" />
          </svg>
        </button>
      </header>
      <div className="admin-panel-body">{children}</div>
    </section>
  );
}

export function AdminPage() {
  const { user: me, isAdmin, isOwner, loading: authLoading } = useAuth();
  const [openPanels, setOpenPanels] = useState<PanelId[]>([]);
  const [config, setConfig] = useState<FilterConfig | null>(null);
  const [checks, setChecks] = useState<CheckMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  const [groupQuery, setGroupQuery] = useState("");
  const [groupHits, setGroupHits] = useState<GroupHit[]>([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [addSeverity, setAddSeverity] = useState<"warn" | "problem">("warn");

  const [vrcUser, setVrcUser] = useState("");
  const [vrcPass, setVrcPass] = useState("");
  const [vrcCode, setVrcCode] = useState("");
  const [vrcNeeds2fa, setVrcNeeds2fa] = useState(false);
  const [vrcStatus, setVrcStatus] = useState<{
    connected: boolean;
    displayName?: string;
    error?: string;
  } | null>(null);
  const [vrcBusy, setVrcBusy] = useState(false);

  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("user");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    setError(null);
    const res = await apiFetch("/admin/filters");
    const data = (await res.json()) as {
      config?: FilterConfig;
      checks?: CheckMeta[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Failed to load filters");
    setConfig(data.config ?? null);
    setChecks(data.checks ?? []);
  }, []);

  const loadOwnerBits = useCallback(async () => {
    if (!isOwner) return;
    const [st, us] = await Promise.all([
      apiFetch("/admin/vrchat/status"),
      apiFetch("/admin/users"),
    ]);
    if (st.ok) {
      setVrcStatus((await st.json()) as typeof vrcStatus);
    }
    if (us.ok) {
      const data = (await us.json()) as { users: AppUserRow[] };
      setUsers(data.users);
    }
  }, [isOwner]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        await loadFilters();
        await loadOwnerBits();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAdmin, loadFilters, loadOwnerBits]);

  if (!authLoading && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  function updateGroups(
    list: "warnGroups" | "problemGroups",
    next: GroupListEntry[],
  ) {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checks: {
          ...prev.checks,
          groups: { ...prev.checks.groups, [list]: next },
        },
      };
    });
  }

  function addGroup(entry: GroupListEntry) {
    if (!config) return;
    const list = addSeverity === "problem" ? "problemGroups" : "warnGroups";
    const other = addSeverity === "problem" ? "warnGroups" : "problemGroups";
    setConfig((prev) => {
      if (!prev) return prev;
      const groups = prev.checks.groups;
      if (groups[list].some((g) => g.id === entry.id)) return prev;
      return {
        ...prev,
        checks: {
          ...prev.checks,
          groups: {
            ...groups,
            [other]: groups[other].filter((g) => g.id !== entry.id),
            [list]: [...groups[list], entry],
          },
        },
      };
    });
  }

  function removeGroup(list: "warnGroups" | "problemGroups", id: string) {
    if (!config) return;
    updateGroups(
      list,
      config.checks.groups[list].filter((g) => g.id !== id),
    );
  }

  async function saveFilters(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiFetch("/admin/filters", {
        method: "PUT",
        body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as { config?: FilterConfig; error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data.config ?? config);
      setMessage("Filters saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function searchGroups() {
    const q = groupQuery.trim();
    if (!q) return;
    setGroupSearching(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/admin/groups/search?q=${encodeURIComponent(q)}`,
      );
      const data = (await res.json()) as { groups?: GroupHit[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Group search failed");
      setGroupHits(data.groups ?? []);
    } catch (err) {
      setGroupHits([]);
      setError(err instanceof Error ? err.message : "Group search failed");
    } finally {
      setGroupSearching(false);
    }
  }

  async function vrcLogin(with2fa: boolean) {
    setVrcBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path = with2fa ? "/admin/vrchat/2fa" : "/admin/vrchat/login";
      const res = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({
          username: vrcUser,
          password: vrcPass,
          ...(with2fa || vrcCode ? { twoFactorCode: vrcCode } : {}),
        }),
      });
      const data = (await res.json()) as {
        status?: string;
        methods?: string[];
        displayName?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "VRChat login failed");
      if (data.status === "twoFactorRequired") {
        setVrcNeeds2fa(true);
        setMessage(
          `2FA required (${(data.methods ?? []).join(", ") || "totp"}). Enter code.`,
        );
        return;
      }
      setVrcNeeds2fa(false);
      setVrcPass("");
      setVrcCode("");
      setMessage(`VRChat connected as ${data.displayName}`);
      await loadOwnerBits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "VRChat login failed");
    } finally {
      setVrcBusy(false);
    }
  }

  async function vrcLogout() {
    setVrcBusy(true);
    try {
      await apiFetch("/admin/vrchat/logout", { method: "POST" });
      setMessage("VRChat session cleared.");
      await loadOwnerBits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
    } finally {
      setVrcBusy(false);
    }
  }

  async function inviteUser(e: FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setTempPassword(null);
    setError(null);
    try {
      const res = await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = (await res.json()) as {
        user?: AuthUser;
        temporaryPassword?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Invite failed");
      setTempPassword(data.temporaryPassword ?? null);
      setInviteEmail("");
      setMessage(`Created ${data.user?.email}. Copy the temporary password now.`);
      await loadOwnerBits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function deleteUser(target: AppUserRow) {
    if (target.isOriginalOwner) {
      setError("Cannot delete the original owner");
      return;
    }
    if (me && target.id === me.id) {
      setError("You cannot delete your own account");
      return;
    }
    if (
      !window.confirm(
        `Delete ${target.email} (${target.role})? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(target.id);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch(`/admin/users/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setMessage(`Deleted ${target.email}`);
      await loadOwnerBits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function togglePanel(id: PanelId) {
    setOpenPanels((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
    setError(null);
    setMessage(null);
  }

  function closePanel(id: PanelId) {
    setOpenPanels((prev) => prev.filter((p) => p !== id));
  }

  function isPanelOpen(id: PanelId) {
    return openPanels.includes(id);
  }

  if (busy || authLoading) {
    return (
      <main className="page">
        <p className="muted">Loading admin…</p>
      </main>
    );
  }

  return (
    <main className="page admin">
      <div className="admin-toolbar">
        <h1>Admin</h1>
        <div className="admin-icons" role="toolbar" aria-label="Admin settings">
          <button
            type="button"
            className={isPanelOpen("filters") ? "admin-icon active" : "admin-icon"}
            onClick={() => togglePanel("filters")}
            title="Filters"
            aria-label="Filters"
            aria-pressed={isPanelOpen("filters")}
          >
            <IconFilters active={isPanelOpen("filters")} />
          </button>
          {isOwner && (
            <button
              type="button"
              className={isPanelOpen("users") ? "admin-icon active" : "admin-icon"}
              onClick={() => togglePanel("users")}
              title="App users"
              aria-label="App users"
              aria-pressed={isPanelOpen("users")}
            >
              <IconUsers active={isPanelOpen("users")} />
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              className={isPanelOpen("vrchat") ? "admin-icon active" : "admin-icon"}
              onClick={() => togglePanel("vrchat")}
              title="VRChat connection"
              aria-label="VRChat connection"
              aria-pressed={isPanelOpen("vrchat")}
            >
              <IconVrchat active={isPanelOpen("vrchat")} />
            </button>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}

      {openPanels.length === 0 && (
        <p className="lede admin-hint">
          Choose an icon to open a settings panel. Minimize to return to the icon row.
        </p>
      )}

      {isPanelOpen("vrchat") && isOwner && (
        <PanelShell title="VRChat connection" onMinimize={() => closePanel("vrchat")}>
          <p className="lede">
            Shared server session used for all lookups. Only the owner can
            (re)authenticate.
          </p>
          <p>
            Status:{" "}
            {vrcStatus?.connected ? (
              <strong>Connected as {vrcStatus.displayName}</strong>
            ) : (
              <span className="muted">
                Not connected{vrcStatus?.error ? ` — ${vrcStatus.error}` : ""}
              </span>
            )}
          </p>
          <div className="stack narrow">
            <label>
              VRChat username / email
              <input
                value={vrcUser}
                onChange={(e) => setVrcUser(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={vrcPass}
                onChange={(e) => setVrcPass(e.target.value)}
                autoComplete="off"
              />
            </label>
            {(vrcNeeds2fa || vrcCode) && (
              <label>
                2FA code
                <input
                  value={vrcCode}
                  onChange={(e) => setVrcCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
            )}
            <div className="actions">
              <button
                type="button"
                disabled={vrcBusy || !vrcUser || !vrcPass}
                onClick={() => void vrcLogin(vrcNeeds2fa)}
              >
                {vrcBusy
                  ? "Working…"
                  : vrcNeeds2fa
                    ? "Verify 2FA"
                    : "Sign in to VRChat"}
              </button>
              {vrcStatus?.connected && (
                <button type="button" disabled={vrcBusy} onClick={() => void vrcLogout()}>
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </PanelShell>
      )}

      {isPanelOpen("users") && isOwner && (
        <PanelShell title="App users" onMinimize={() => closePanel("users")}>
          <p className="lede">
            Invite owners, admins, or lookup users with a one-time throwaway
            password. The original owner cannot be deleted.
          </p>
          <form onSubmit={inviteUser} className="search-row">
            <input
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
            <button type="submit" disabled={inviteBusy}>
              {inviteBusy ? "Creating…" : "Create user"}
            </button>
          </form>
          {tempPassword && (
            <p className="temp-pw">
              Temporary password (copy now): <code>{tempPassword}</code>
            </p>
          )}
          <ul className="user-table">
            {users.map((u) => (
              <li key={u.id}>
                <strong>{u.email}</strong>
                <span className="pill">{u.role}</span>
                {u.mustChangePassword && (
                  <span className="muted">must change password</span>
                )}
                {u.isOriginalOwner ? (
                  <span className="muted">original</span>
                ) : me && u.id === me.id ? (
                  <span className="muted">you</span>
                ) : (
                  <button
                    type="button"
                    className="linkish danger"
                    disabled={deletingId === u.id}
                    onClick={() => void deleteUser(u)}
                  >
                    {deletingId === u.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </PanelShell>
      )}

      {isPanelOpen("filters") && config && (
        <PanelShell title="Filters" onMinimize={() => closePanel("filters")}>
          <form onSubmit={saveFilters}>
            {checks.map((check) => (
              <label key={check.id} className="check-toggle">
                <input
                  type="checkbox"
                  checked={config.checks[check.id]?.enabled !== false}
                  onChange={(e) => {
                    setConfig({
                      ...config,
                      checks: {
                        ...config.checks,
                        [check.id]: {
                          ...config.checks[check.id],
                          enabled: e.target.checked,
                        },
                      },
                    });
                  }}
                />
                <span>
                  <strong>{check.name}</strong>
                  <span className="muted"> — {check.description}</span>
                </span>
              </label>
            ))}

            {typeof config.checks["new-account"].maxAgeDays === "number" && (
              <label>
                New account max age (days)
                <input
                  type="number"
                  min={0}
                  value={config.checks["new-account"].maxAgeDays}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      checks: {
                        ...config.checks,
                        "new-account": {
                          ...config.checks["new-account"],
                          maxAgeDays: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            )}

            <h3>Group lists</h3>
            <div className="two-col">
              <div>
                <h4>Warn</h4>
                <ul>
                  {config.checks.groups.warnGroups.map((g) => (
                    <li key={g.id}>
                      {g.name || g.id}{" "}
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => removeGroup("warnGroups", g.id)}
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Problem</h4>
                <ul>
                  {config.checks.groups.problemGroups.map((g) => (
                    <li key={g.id}>
                      {g.name || g.id}{" "}
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => removeGroup("problemGroups", g.id)}
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="search-row">
              <select
                value={addSeverity}
                onChange={(e) =>
                  setAddSeverity(e.target.value as "warn" | "problem")
                }
              >
                <option value="warn">Add as warn</option>
                <option value="problem">Add as problem</option>
              </select>
              <input
                value={groupQuery}
                onChange={(e) => setGroupQuery(e.target.value)}
                placeholder="Search groups or paste grp_…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchGroups();
                  }
                }}
              />
              <button
                type="button"
                disabled={groupSearching}
                onClick={() => void searchGroups()}
              >
                {groupSearching ? "…" : "Search"}
              </button>
            </div>
            <ul className="result-list compact">
              {groupHits.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="result-card"
                    onClick={() => addGroup({ id: g.id, name: g.name })}
                  >
                    {g.iconUrl ? (
                      <img src={g.iconUrl} alt="" />
                    ) : (
                      <div className="avatar-fallback" />
                    )}
                    <div>
                      <strong>{g.name}</strong>
                      <div className="muted mono">{g.id}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save filters"}
            </button>
          </form>
        </PanelShell>
      )}
    </main>
  );
}
