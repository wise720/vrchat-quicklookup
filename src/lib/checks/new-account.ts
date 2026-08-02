import type { NewAccountCheckConfig } from "@/lib/filters/config";
import { registerCheck } from "@/lib/checks/types";

registerCheck({
  id: "new-account",
  name: "New account",
  description:
    "Flags accounts whose date_joined is within the configured age threshold.",
  run(ctx) {
    const settings = ctx.config.checks["new-account"] as NewAccountCheckConfig;
    const maxAgeDays = settings.maxAgeDays ?? 7;
    const joined = ctx.user.date_joined;
    if (!joined) return [];

    const joinedAt = new Date(joined);
    if (Number.isNaN(joinedAt.getTime())) return [];

    const ageMs = Date.now() - joinedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) return [];

    return [
      {
        id: "new-account",
        checkId: "new-account",
        severity: "warn" as const,
        label: `New account (${Math.max(0, Math.floor(ageDays))}d)`,
        detail: `Joined ${joinedAt.toISOString().slice(0, 10)} (threshold ${maxAgeDays} days)`,
      },
    ];
  },
});
