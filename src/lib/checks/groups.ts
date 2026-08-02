import type { GroupsCheckConfig } from "@/lib/filters/config";
import { registerCheck, type Warning } from "@/lib/checks/types";

registerCheck({
  id: "groups",
  name: "Group membership",
  description:
    "Flags users who belong to groups marked as warn or problem in Admin.",
  run(ctx) {
    const settings = ctx.config.checks.groups as GroupsCheckConfig;
    const warnIds = new Map(
      (settings.warnGroups ?? []).map((g) => [g.id, g.name ?? g.id]),
    );
    const problemIds = new Map(
      (settings.problemGroups ?? []).map((g) => [g.id, g.name ?? g.id]),
    );

    const warnings: Warning[] = [];

    for (const membership of ctx.groups) {
      const groupId = membership.groupId;
      if (!groupId) continue;

      if (problemIds.has(groupId)) {
        const configuredName = problemIds.get(groupId);
        warnings.push({
          id: `groups:problem:${groupId}`,
          checkId: "groups",
          severity: "problem",
          label: `Problem group: ${membership.name || configuredName}`,
          detail: `Member of problem group ${membership.name} (${groupId})`,
        });
        continue;
      }

      if (warnIds.has(groupId)) {
        const configuredName = warnIds.get(groupId);
        warnings.push({
          id: `groups:warn:${groupId}`,
          checkId: "groups",
          severity: "warn",
          label: `Warn group: ${membership.name || configuredName}`,
          detail: `Member of warn group ${membership.name} (${groupId})`,
        });
      }
    }

    return warnings;
  },
});
