# VRChat Quick Lookup

Local moderation helper: sign in with VRChat, look up users, and surface **warn** / **problem** labels from configurable filters.

Binds to `127.0.0.1` by default so your VRChat session cookie stays on your machine.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Edit `.env.local` and set a real contact VRChat can reach (email or URL). Placeholders like `example.com` are rejected:

```env
VRCHAT_CONTACT=you@yourdomain.com
```

This becomes the User-Agent `VRChatQuickLookup/0.1.0 you@yourdomain.com`. To override the full string:

```env
VRCHAT_USER_AGENT=VRChatQuickLookup/0.1.0 you@yourdomain.com
```

## Run

```bash
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), then **Sign in with VRChat** (username/password + 2FA if enabled).

## Features

- **Sign in with VRChat** — session cookie persisted under `data/` so restarts do not burn new sessions
- **Lookup** — search by display name or paste a `usr_…` id
- **Warnings** — checks run against VRChat API response data (profile + groups)
- **Admin** — enable/disable checks; manage group **warn** and **problem** lists

## Admin: group filters

1. Open **Admin**
2. Search groups by name/short code or paste a `grp_…` id
3. Add each group as **warn** or **problem**
4. On the next user lookup, membership in those groups produces matching labels

Filter config is stored at `data/filters.json` (gitignored).

## Register a new check

Checks are TypeScript modules registered at load time.

1. Create `src/lib/checks/my-check.ts`:

```ts
import { registerCheck } from "@/lib/checks/types";

registerCheck({
  id: "my-check",
  name: "My check",
  description: "What this flags and why.",
  run(ctx) {
    // Inspect ctx.user / ctx.groups / ctx.config
    if (!ctx.user.bio?.includes("example")) return [];
    return [
      {
        id: "my-check:example",
        checkId: "my-check",
        severity: "warn", // or "problem"
        label: "Example pattern in bio",
        detail: "Optional detail for moderators",
      },
    ];
  },
});
```

2. Import it from [`src/lib/checks/index.ts`](src/lib/checks/index.ts):

```ts
import "@/lib/checks/my-check";
```

3. Optionally add default settings in [`src/lib/filters/config.ts`](src/lib/filters/config.ts) (`DEFAULT_FILTER_CONFIG`) so Admin can toggle/configure them.

No UI rewrite is required for code-only checks; they appear in Admin once registered. Tunable lists (like groups) should read/write `ctx.config`.

## API sketch

| Route | Purpose |
| --- | --- |
| `POST /api/auth/login` | VRChat username/password |
| `POST /api/auth/2fa` | Complete TOTP / email OTP |
| `GET /api/auth/me` | Current session user |
| `POST /api/auth/logout` | Clear session |
| `GET /api/users/search?q=` | Search users |
| `GET /api/users/[userId]` | User + groups + warnings |
| `GET/PUT /api/admin/filters` | Load/save filter config |
| `GET /api/admin/groups/search?q=` | Resolve groups for Admin |

## Notes

- Credentials and VRChat cookies never leave the Next.js server process (stored under `data/`).
- If the session expires, API routes return `401` and the UI sends you back to sign-in.
- This tool is for local moderation aid only; follow VRChat's terms and use a dedicated User-Agent with contact info.
