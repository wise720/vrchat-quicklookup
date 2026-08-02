import type { FilterConfig, Warning } from "@vrchat-quicklookup/shared";

export type CheckUser = {
  id: string;
  displayName: string;
  bio?: string | null;
  date_joined?: string | null;
  tags?: string[] | null;
  [key: string]: unknown;
};

export type CheckGroup = {
  groupId?: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
};

type CheckContext = {
  user: CheckUser;
  groups: CheckGroup[];
  config: FilterConfig;
};

type UserCheck = {
  id: string;
  name: string;
  description: string;
  run: (ctx: CheckContext) => Warning[] | Promise<Warning[]>;
};

const registry: UserCheck[] = [];

export function registerCheck(check: UserCheck) {
  const idx = registry.findIndex((c) => c.id === check.id);
  if (idx >= 0) registry[idx] = check;
  else registry.push(check);
}

export function listChecks() {
  return [...registry];
}

export async function runChecks(ctx: CheckContext): Promise<Warning[]> {
  const warnings: Warning[] = [];
  for (const check of registry) {
    const cfg = ctx.config.checks[check.id];
    if (cfg && cfg.enabled === false) continue;
    const results = await check.run(ctx);
    for (const w of results) warnings.push({ ...w, checkId: check.id });
  }
  warnings.sort((a, b) => {
    const rank = (s: Warning["severity"]) => (s === "problem" ? 0 : 1);
    return rank(a.severity) - rank(b.severity) || a.label.localeCompare(b.label);
  });
  return warnings;
}

registerCheck({
  id: "groups",
  name: "Group membership",
  description: "Flags users in warn/problem groups.",
  run(ctx) {
    const settings = ctx.config.checks.groups;
    const warnIds = new Map(
      (settings.warnGroups ?? []).map((g) => [g.id, g.name ?? g.id]),
    );
    const problemIds = new Map(
      (settings.problemGroups ?? []).map((g) => [g.id, g.name ?? g.id]),
    );
    const warnings: Warning[] = [];
    for (const membership of ctx.groups) {
      const groupId = membership.groupId || membership.id;
      if (!groupId) continue;
      const name = membership.name || warnIds.get(groupId) || groupId;
      if (problemIds.has(groupId)) {
        warnings.push({
          id: `groups:problem:${groupId}`,
          checkId: "groups",
          severity: "problem",
          label: `Problem group: ${name}`,
          detail: `Member of problem group ${name} (${groupId})`,
        });
      } else if (warnIds.has(groupId)) {
        warnings.push({
          id: `groups:warn:${groupId}`,
          checkId: "groups",
          severity: "warn",
          label: `Warn group: ${name}`,
          detail: `Member of warn group ${name} (${groupId})`,
        });
      }
    }
    return warnings;
  },
});

registerCheck({
  id: "empty-bio",
  name: "Empty bio",
  description: "Flags empty bios.",
  run(ctx) {
    if ((ctx.user.bio ?? "").trim()) return [];
    return [
      {
        id: "empty-bio",
        checkId: "empty-bio",
        severity: "warn",
        label: "Empty bio",
        detail: "Profile bio is empty",
      },
    ];
  },
});

registerCheck({
  id: "new-account",
  name: "New account",
  description: "Flags accounts younger than the threshold.",
  run(ctx) {
    const maxAgeDays = ctx.config.checks["new-account"].maxAgeDays ?? 7;
    const joined = ctx.user.date_joined;
    if (!joined) return [];
    const joinedAt = new Date(joined);
    if (Number.isNaN(joinedAt.getTime())) return [];
    const ageDays = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) return [];
    return [
      {
        id: "new-account",
        checkId: "new-account",
        severity: "warn",
        label: `New account (${Math.max(0, Math.floor(ageDays))}d)`,
        detail: `Joined ${joinedAt.toISOString().slice(0, 10)} (threshold ${maxAgeDays} days)`,
      },
    ];
  },
});
