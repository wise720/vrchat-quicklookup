# VRChat Quick Lookup

Moderation helper split into a **Vite + React SPA** (static/CDN) and a **Fastify API** (VPS) that owns a single shared VRChat session via the [`vrchat`](https://www.npmjs.com/package/vrchat) package. App users, roles, filters, and lookup cache live in **Neon Postgres**.

## Layout

```
apps/web/          # Vite + React SPA
apps/api/          # Fastify API (VRChat session, auth, lookups)
packages/shared/   # Shared types (roles, filters, DTOs)
```

## Roles

| Role  | Lookup / refresh | Edit filters | VRChat login | Invite app users |
|-------|-------------------|--------------|--------------|------------------|
| user  | yes               | no           | no           | no               |
| admin | yes               | yes          | no           | no               |
| owner | yes               | yes          | yes          | yes              |

The owner invites users with a **throwaway password**. New users must change it before using the app (`must_change_password`).

## Setup

1. Create a Neon project and copy the connection string.
2. Configure API env:

```bash
cp .env.example apps/api/.env
# edit apps/api/.env
```

```env
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
JWT_SECRET=long-random-secret
OWNER_EMAIL=you@yourdomain.com
OWNER_PASSWORD=initial-owner-password
VRCHAT_CONTACT=you@yourdomain.com
FRONTEND_ORIGIN=http://localhost:5173
LOOKUP_CACHE_TTL_SECONDS=604800
PORT=8787
```

3. Configure web env:

```bash
cp .env.example apps/web/.env
# keep only / set:
VITE_API_BASE_URL=http://localhost:8787
```

4. Install and seed the owner:

```bash
pnpm install
pnpm seed:owner
```

5. Run both apps:

```bash
pnpm dev
# API :8787  ·  Web :5173
```

Sign in as the owner → **Admin → VRChat connection** to authenticate the shared VRChat session → then use Lookup.

## Deploy

### API (VPS)

1. Build: `pnpm --filter @vrchat-quicklookup/api build` (after `pnpm install`).
2. Run with Node 20+: `pnpm --filter @vrchat-quicklookup/api start` (or `node --env-file=.env dist/index.js` from `apps/api`).
3. Put behind HTTPS (Caddy/nginx). Set `FRONTEND_ORIGIN` to your CDN origin (exact URL).
4. Ensure `DATABASE_URL`, `JWT_SECRET`, and `VRCHAT_CONTACT` are set. Seed owner once with `pnpm seed:owner`.

### Frontend (Netlify / CDN)

Connect the GitHub repo in Netlify. Build settings are in `netlify.toml`.

1. In Netlify, set env var `VITE_API_BASE_URL` to your public API URL (e.g. `https://api.yourdomain.com`).
2. Deploy. Publish output is `apps/web/dist`.
3. On the API VPS, set `FRONTEND_ORIGIN` to the Netlify site URL (exact origin, e.g. `https://your-site.netlify.app` or your custom domain).

Manual/static alternative: `pnpm --filter @vrchat-quicklookup/web build` and upload `apps/web/dist`.

## API surface

- `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`
- `GET /users/search?q=`, `GET /users/:id`, `POST /users/:id/refresh`
- `GET/PUT /admin/filters`, `GET /admin/groups/search` — admin+
- `POST /admin/vrchat/login|2fa|logout`, `GET /admin/vrchat/status` — owner
- `GET/POST /admin/users` — owner (create returns throwaway password once)

Lookup responses are cached in Neon for `LOOKUP_CACHE_TTL_SECONDS` (default 7 days). **Refresh** on the user detail page bypasses the cache.
