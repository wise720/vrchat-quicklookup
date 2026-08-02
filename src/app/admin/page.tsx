"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/require-auth";
import type {
  FilterConfig,
  GroupListEntry,
  GroupsCheckConfig,
  NewAccountCheckConfig,
} from "@/lib/filters/config";

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

function AdminPage() {
  const router = useRouter();
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/filters");
      const data = (await res.json()) as {
        config?: FilterConfig;
        checks?: CheckMeta[];
        error?: string;
      };
      if (res.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to load filters");
      setConfig(data.config ?? null);
      setChecks(data.checks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/filters");
        if (cancelled) return;
        const data = (await res.json()) as {
          config?: FilterConfig;
          checks?: CheckMeta[];
          error?: string;
        };
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/signin");
          return;
        }
        if (!res.ok) throw new Error(data.error || "Failed to load filters");
        setConfig(data.config ?? null);
        setChecks(data.checks ?? []);
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
  }, [router]);

  async function save(next: FilterConfig) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/filters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      const data = (await res.json()) as { config?: FilterConfig; error?: string };
      if (res.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data.config ?? next);
      setMessage("Saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateCheckEnabled(checkId: string, enabled: boolean) {
    if (!config) return;
    const next: FilterConfig = {
      ...config,
      checks: {
        ...config.checks,
        [checkId]: {
          ...config.checks[checkId],
          enabled,
        },
      },
    };
    setConfig(next);
    void save(next);
  }

  function updateMaxAgeDays(maxAgeDays: number) {
    if (!config) return;
    const current = config.checks["new-account"] as NewAccountCheckConfig;
    const next: FilterConfig = {
      ...config,
      checks: {
        ...config.checks,
        "new-account": {
          ...current,
          maxAgeDays,
        },
      },
    };
    setConfig(next);
  }

  async function searchGroups(e: FormEvent) {
    e.preventDefault();
    const q = groupQuery.trim();
    if (!q) return;
    setGroupSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/groups/search?q=${encodeURIComponent(q)}`,
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

  function addGroup(group: GroupHit) {
    if (!config) return;
    const groups = config.checks.groups as GroupsCheckConfig;
    const entry: GroupListEntry = { id: group.id, name: group.name };
    const warn = groups.warnGroups.filter((g) => g.id !== group.id);
    const problem = groups.problemGroups.filter((g) => g.id !== group.id);
    if (addSeverity === "warn") warn.push(entry);
    else problem.push(entry);

    const next: FilterConfig = {
      ...config,
      checks: {
        ...config.checks,
        groups: {
          ...groups,
          warnGroups: warn,
          problemGroups: problem,
        },
      },
    };
    setConfig(next);
    void save(next);
  }

  function removeGroup(severity: "warn" | "problem", id: string) {
    if (!config) return;
    const groups = config.checks.groups as GroupsCheckConfig;
    const next: FilterConfig = {
      ...config,
      checks: {
        ...config.checks,
        groups: {
          ...groups,
          warnGroups:
            severity === "warn"
              ? groups.warnGroups.filter((g) => g.id !== id)
              : groups.warnGroups,
          problemGroups:
            severity === "problem"
              ? groups.problemGroups.filter((g) => g.id !== id)
              : groups.problemGroups,
        },
      },
    };
    setConfig(next);
    void save(next);
  }

  function moveGroup(from: "warn" | "problem", id: string) {
    if (!config) return;
    const groups = config.checks.groups as GroupsCheckConfig;
    const source = from === "warn" ? groups.warnGroups : groups.problemGroups;
    const entry = source.find((g) => g.id === id);
    if (!entry) return;
    const to = from === "warn" ? "problem" : "warn";
    const warn = groups.warnGroups.filter((g) => g.id !== id);
    const problem = groups.problemGroups.filter((g) => g.id !== id);
    if (to === "warn") warn.push(entry);
    else problem.push(entry);
    const next: FilterConfig = {
      ...config,
      checks: {
        ...config.checks,
        groups: { ...groups, warnGroups: warn, problemGroups: problem },
      },
    };
    setConfig(next);
    void save(next);
  }

  const groupsConfig = config?.checks.groups as GroupsCheckConfig | undefined;
  const newAccount = config?.checks["new-account"] as
    | NewAccountCheckConfig
    | undefined;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
        Admin filters
      </h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">
        Enable checks and manage which groups mark a user as warn or problem.
        Changes apply on the next lookup.
      </p>

      {busy && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {error && <p className="mt-4 text-sm text-[var(--problem)]">{error}</p>}
      {message && <p className="mt-4 text-sm text-[var(--accent)]">{message}</p>}
      {saving && <p className="mt-2 text-sm text-[var(--muted)]">Saving…</p>}

      {config && (
        <div className="mt-8 flex flex-col gap-10">
          <section>
            <h2 className="text-lg font-medium">Registered checks</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {checks.map((check) => (
                <li
                  key={check.id}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-[var(--ink)]">
                        {check.name}
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {check.description}
                      </p>
                      <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                        id: {check.id}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={check.enabled}
                        onChange={(e) =>
                          updateCheckEnabled(check.id, e.target.checked)
                        }
                      />
                      Enabled
                    </label>
                  </div>

                  {check.id === "new-account" && newAccount && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-3">
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-[var(--muted)]">
                          Max age (days)
                        </span>
                        <input
                          type="number"
                          min={0}
                          className="w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                          value={newAccount.maxAgeDays}
                          onChange={(e) =>
                            updateMaxAgeDays(Number(e.target.value) || 0)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
                        onClick={() => void save(config)}
                      >
                        Save age threshold
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium">Group lists</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Search by name/short code or paste a <code>grp_…</code> id, then add
              as warn or problem.
            </p>

            <form
              onSubmit={searchGroups}
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Find group</span>
                <input
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  placeholder="Name, short code, or grp_…"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Add as</span>
                <select
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  value={addSeverity}
                  onChange={(e) =>
                    setAddSeverity(e.target.value as "warn" | "problem")
                  }
                >
                  <option value="warn">Warn</option>
                  <option value="problem">Problem</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={groupSearching || !groupQuery.trim()}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-[var(--accent-ink)] disabled:opacity-60"
              >
                {groupSearching ? "Searching…" : "Search"}
              </button>
            </form>

            {groupHits.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {groupHits.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{g.name}</div>
                      <div className="truncate font-mono text-xs text-[var(--muted)]">
                        {g.id}
                        {g.shortCode ? ` · ${g.shortCode}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
                      onClick={() => addGroup(g)}
                    >
                      Add as {addSeverity}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <GroupList
                title="Warn groups"
                tone="warn"
                items={groupsConfig?.warnGroups ?? []}
                onRemove={(id) => removeGroup("warn", id)}
                onMove={(id) => moveGroup("warn", id)}
                moveLabel="Move to problem"
              />
              <GroupList
                title="Problem groups"
                tone="problem"
                items={groupsConfig?.problemGroups ?? []}
                onRemove={(id) => removeGroup("problem", id)}
                onMove={(id) => moveGroup("problem", id)}
                moveLabel="Move to warn"
              />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function GroupList({
  title,
  tone,
  items,
  onRemove,
  onMove,
  moveLabel,
}: {
  title: string;
  tone: "warn" | "problem";
  items: GroupListEntry[];
  onRemove: (id: string) => void;
  onMove: (id: string) => void;
  moveLabel: string;
}) {
  return (
    <div>
      <h3
        className={
          tone === "problem"
            ? "text-sm font-semibold uppercase tracking-wide text-[var(--problem)]"
            : "text-sm font-semibold uppercase tracking-wide text-[var(--warn)]"
        }
      >
        {title}
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {items.length === 0 && (
          <li className="text-sm text-[var(--muted)]">None yet.</li>
        )}
        {items.map((g) => (
          <li
            key={g.id}
            className="rounded-md border border-[var(--border)] px-3 py-2"
          >
            <div className="font-medium text-[var(--ink)]">
              {g.name || g.id}
            </div>
            <div className="font-mono text-xs text-[var(--muted)]">{g.id}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                type="button"
                className="underline text-[var(--muted)] hover:text-[var(--ink)]"
                onClick={() => onMove(g.id)}
              >
                {moveLabel}
              </button>
              <button
                type="button"
                className="underline text-[var(--problem)]"
                onClick={() => onRemove(g.id)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <AdminPage />
    </RequireAuth>
  );
}
