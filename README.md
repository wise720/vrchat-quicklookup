# VRChat Quick Lookup

Cloud-friendly moderation helper: sign in with VRChat (session stays in the **browser**), look up users, and surface **warn** / **problem** labels from filters stored in **Neon Postgres**.

Tagged baseline: `v0.1.0` (local disk session). Current app is `0.2.0` (client session + Neon).

## Setup

1. Create a free Neon project: [https://console.neon.tech](https://console.neon.tech)
2. Copy the connection string into `.env.local`
3. Set your VRChat User-Agent contact and admin user id

```bash
pnpm install
cp .env.example .env.local
```

```env
VRCHAT_CONTACT=you@yourdomain.com
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
ADMIN_VRCHAT_USER_IDS=usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Or seed admin into the DB (after `DATABASE_URL` is set):

```bash
pnpm seed:admin usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Only seeded / env-listed VRChat users see the **Admin** nav and can change filters.

## Run locally

```bash
pnpm dev
```

## Deploy (e.g. Vercel)

1. Push the repo and import into Vercel (or similar).
2. Set env vars: `VRCHAT_CONTACT`, `DATABASE_URL`, `ADMIN_VRCHAT_USER_IDS`.
3. Deploy. Tables (`filter_config`, `admin_users`) are created automatically on first use.

## How auth works

- Sign-in proxies to VRChat; **auth cookies are returned to the client** and stored in `localStorage`.
- Each API call sends `X-VRChat-Auth` (and optional `X-VRChat-TwoFactorAuth`).
- The server does **not** persist VRChat sessions — suitable for serverless hosts.
- Filter config / warn+problem group lists live in Neon.

## Admin filters

1. Sign in as a seeded admin VRChat user.
2. Open **Admin** — enable/disable checks; manage group warn/problem lists.
3. Lookups for everyone use that shared Neon config.

## Register a new check

1. Add `src/lib/checks/my-check.ts` and call `registerCheck({...})`.
2. Import it from [`src/lib/checks/index.ts`](src/lib/checks/index.ts).
3. Optionally extend defaults in [`src/lib/filters/schema.ts`](src/lib/filters/schema.ts).

## Security note

Admin gating is intentionally light (match VRChat user id). Do not treat this as hardened multi-tenant security yet.
