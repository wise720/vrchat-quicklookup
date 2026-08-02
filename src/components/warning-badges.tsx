import type { VrchatSeverity } from "@/lib/vrchat/types";

export function WarningBadges({
  warnings,
}: {
  warnings: Array<{
    id: string;
    severity: VrchatSeverity;
    label: string;
    detail?: string;
  }>;
}) {
  if (warnings.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">No warnings from active filters.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {warnings.map((w) => (
        <li
          key={w.id}
          className={
            w.severity === "problem"
              ? "rounded-md border border-[var(--problem)] bg-[var(--problem-bg)] px-3 py-2"
              : "rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] px-3 py-2"
          }
        >
          <div className="flex items-center gap-2">
            <span
              className={
                w.severity === "problem"
                  ? "text-xs font-semibold uppercase tracking-wide text-[var(--problem)]"
                  : "text-xs font-semibold uppercase tracking-wide text-[var(--warn)]"
              }
            >
              {w.severity}
            </span>
            <span className="font-medium text-[var(--ink)]">{w.label}</span>
          </div>
          {w.detail && (
            <p className="mt-1 text-sm text-[var(--muted)]">{w.detail}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
