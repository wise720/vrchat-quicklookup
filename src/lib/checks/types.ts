import type { FilterConfig } from "@/lib/filters/config";
import type {
  VrchatGroupMembership,
  VrchatSeverity,
  VrchatUser,
} from "@/lib/vrchat/types";

export type Warning = {
  id: string;
  severity: VrchatSeverity;
  label: string;
  detail?: string;
  checkId: string;
};

export type CheckContext = {
  user: VrchatUser;
  groups: VrchatGroupMembership[];
  config: FilterConfig;
};

export type UserCheck = {
  id: string;
  name: string;
  description: string;
  run: (ctx: CheckContext) => Warning[] | Promise<Warning[]>;
};

const registry: UserCheck[] = [];

export function registerCheck(check: UserCheck): void {
  const existing = registry.findIndex((c) => c.id === check.id);
  if (existing >= 0) {
    registry[existing] = check;
  } else {
    registry.push(check);
  }
}

export function listChecks(): UserCheck[] {
  return [...registry];
}

export async function runChecks(ctx: CheckContext): Promise<Warning[]> {
  const warnings: Warning[] = [];

  for (const check of registry) {
    const checkConfig = ctx.config.checks[check.id];
    if (checkConfig && checkConfig.enabled === false) continue;

    const results = await check.run(ctx);
    for (const warning of results) {
      warnings.push({ ...warning, checkId: check.id });
    }
  }

  warnings.sort((a, b) => {
    const rank = (s: VrchatSeverity) => (s === "problem" ? 0 : 1);
    return rank(a.severity) - rank(b.severity) || a.label.localeCompare(b.label);
  });

  return warnings;
}
