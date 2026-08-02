import type { VrchatSeverity } from "@/lib/vrchat/types";

export type GroupListEntry = {
  id: string;
  name?: string;
};

export type GroupsCheckConfig = {
  enabled: boolean;
  warnGroups: GroupListEntry[];
  problemGroups: GroupListEntry[];
};

export type EmptyBioCheckConfig = {
  enabled: boolean;
};

export type NewAccountCheckConfig = {
  enabled: boolean;
  maxAgeDays: number;
};

export type FilterConfig = {
  checks: {
    groups: GroupsCheckConfig;
    "empty-bio": EmptyBioCheckConfig;
    "new-account": NewAccountCheckConfig;
    [checkId: string]: { enabled: boolean } & Record<string, unknown>;
  };
};

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  checks: {
    groups: {
      enabled: true,
      warnGroups: [],
      problemGroups: [],
    },
    "empty-bio": {
      enabled: true,
    },
    "new-account": {
      enabled: true,
      maxAgeDays: 7,
    },
  },
};

function normalizeGroupList(list: unknown): GroupListEntry[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: GroupListEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as GroupListEntry).id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = (item as GroupListEntry).name;
    out.push({
      id,
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
    });
  }
  return out;
}

export function mergeConfig(raw: unknown): FilterConfig {
  const base = structuredClone(DEFAULT_FILTER_CONFIG);
  if (!raw || typeof raw !== "object") return base;

  const incoming = raw as Partial<FilterConfig>;
  const checks = incoming.checks ?? {};

  for (const [id, value] of Object.entries(checks)) {
    if (!value || typeof value !== "object") continue;
    const existing = base.checks[id] ?? { enabled: true };
    base.checks[id] = {
      ...existing,
      ...value,
      enabled:
        typeof (value as { enabled?: unknown }).enabled === "boolean"
          ? (value as { enabled: boolean }).enabled
          : existing.enabled !== false,
    } as FilterConfig["checks"][string];
  }

  const groups = base.checks.groups as GroupsCheckConfig;
  groups.warnGroups = normalizeGroupList(groups.warnGroups);
  groups.problemGroups = normalizeGroupList(groups.problemGroups);

  const newAccount = base.checks["new-account"] as NewAccountCheckConfig;
  if (typeof newAccount.maxAgeDays !== "number" || newAccount.maxAgeDays < 0) {
    newAccount.maxAgeDays = 7;
  }

  return base;
}

export function severityRank(severity: VrchatSeverity): number {
  return severity === "problem" ? 2 : 1;
}
