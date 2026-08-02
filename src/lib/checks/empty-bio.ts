import { registerCheck } from "@/lib/checks/types";

registerCheck({
  id: "empty-bio",
  name: "Empty bio",
  description: "Flags users with an empty or whitespace-only bio.",
  run(ctx) {
    const bio = (ctx.user.bio ?? "").trim();
    if (bio.length > 0) return [];

    return [
      {
        id: "empty-bio",
        checkId: "empty-bio",
        severity: "warn" as const,
        label: "Empty bio",
        detail: "Profile bio is empty",
      },
    ];
  },
});
