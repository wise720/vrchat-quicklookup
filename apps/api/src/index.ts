import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AuthUser, FilterConfig, Role } from "@vrchat-quicklookup/shared";
import {
  assertOwner,
  assertRole,
  changePassword,
  loginWithPassword,
  ownerCreateUser,
  ownerDeleteUser,
  signToken,
  verifyToken,
} from "./auth.js";
import { listChecks } from "./checks.js";
import { ensureSchema, listUsers, loadFilterConfig, saveFilterConfig } from "./db.js";
import { lookupUser, searchGroups, searchUsers } from "./lookup.js";
import {
  isVrchatError,
  vrchatLogin,
  vrchatLogout,
  vrchatStatus,
} from "./vrchat.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

function httpError(err: unknown): { status: number; message: string } {
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status: number }).status);
    if (Number.isFinite(status) && status >= 400) {
      return {
        status,
        message: err instanceof Error ? err.message : "Request failed",
      };
    }
  }
  if (isVrchatError(err)) {
    return {
      status: err.statusCode && err.statusCode >= 400 ? err.statusCode : 502,
      message: err.message || "VRChat API error",
    };
  }
  return {
    status: 500,
    message: err instanceof Error ? err.message : "Internal error",
  };
}

async function requireAuth(
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
  opts: { allowMustChange?: boolean; minRole?: Role; ownerOnly?: boolean } = {},
) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  try {
    const user = await verifyToken(header.slice(7));
    if (user.mustChangePassword && !opts.allowMustChange) {
      return reply.code(403).send({
        error: "Password change required",
        code: "MUST_CHANGE_PASSWORD",
      });
    }
    if (opts.ownerOnly) assertOwner(user);
    else if (opts.minRole) assertRole(user, opts.minRole);
    request.authUser = user;
  } catch (err) {
    const { status, message } = httpError(err);
    return reply.code(status === 500 ? 401 : status).send({ error: message });
  }
}

async function main() {
  await ensureSchema();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN?.trim() || true,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.get("/health", async () => ({ ok: true }));

  app.post<{
    Body: { email?: string; password?: string };
  }>("/auth/login", async (request, reply) => {
    try {
      const email = request.body?.email?.trim() ?? "";
      const password = request.body?.password ?? "";
      if (!email || !password) {
        return reply.code(400).send({ error: "Email and password required" });
      }
      const result = await loginWithPassword(email, password);
      return result;
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.get("/auth/me", async (request, reply) => {
    await requireAuth(request, reply, { allowMustChange: true });
    if (reply.sent) return;
    return { user: request.authUser };
  });

  app.post<{
    Body: { currentPassword?: string; newPassword?: string };
  }>("/auth/change-password", async (request, reply) => {
    await requireAuth(request, reply, { allowMustChange: true });
    if (reply.sent) return;
    try {
      const currentPassword = request.body?.currentPassword ?? "";
      const newPassword = request.body?.newPassword ?? "";
      const user = await changePassword(
        request.authUser!.id,
        currentPassword,
        newPassword,
      );
      const token = await signToken(user);
      return { user, token };
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.get<{ Querystring: { q?: string } }>(
    "/users/search",
    async (request, reply) => {
      await requireAuth(request, reply);
      if (reply.sent) return;
      try {
        return await searchUsers(request.query.q ?? "");
      } catch (err) {
        const { status, message } = httpError(err);
        return reply.code(status).send({ error: message });
      }
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/users/:userId",
    async (request, reply) => {
      await requireAuth(request, reply);
      if (reply.sent) return;
      try {
        return await lookupUser(request.params.userId);
      } catch (err) {
        const { status, message } = httpError(err);
        return reply.code(status).send({ error: message });
      }
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/refresh",
    async (request, reply) => {
      await requireAuth(request, reply);
      if (reply.sent) return;
      try {
        return await lookupUser(request.params.userId, { bypassCache: true });
      } catch (err) {
        const { status, message } = httpError(err);
        return reply.code(status).send({ error: message });
      }
    },
  );

  app.get("/admin/filters", async (request, reply) => {
    await requireAuth(request, reply, { minRole: "admin" });
    if (reply.sent) return;
    try {
      const config = await loadFilterConfig();
      const checks = listChecks().map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        enabled: config.checks[c.id]?.enabled !== false,
        settings: config.checks[c.id] ?? { enabled: true },
      }));
      return { config, checks };
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.put<{ Body: { config?: FilterConfig } }>(
    "/admin/filters",
    async (request, reply) => {
      await requireAuth(request, reply, { minRole: "admin" });
      if (reply.sent) return;
      try {
        if (!request.body?.config) {
          return reply.code(400).send({ error: "config required" });
        }
        await saveFilterConfig(request.body.config);
        const config = await loadFilterConfig();
        return { config };
      } catch (err) {
        const { status, message } = httpError(err);
        return reply.code(status).send({ error: message });
      }
    },
  );

  app.get<{ Querystring: { q?: string } }>(
    "/admin/groups/search",
    async (request, reply) => {
      await requireAuth(request, reply, { minRole: "admin" });
      if (reply.sent) return;
      try {
        return await searchGroups(request.query.q ?? "");
      } catch (err) {
        const { status, message } = httpError(err);
        return reply.code(status).send({ error: message });
      }
    },
  );

  app.get("/admin/vrchat/status", async (request, reply) => {
    await requireAuth(request, reply, { ownerOnly: true });
    if (reply.sent) return;
    return vrchatStatus();
  });

  app.post<{
    Body: { username?: string; password?: string; twoFactorCode?: string };
  }>("/admin/vrchat/login", async (request, reply) => {
    await requireAuth(request, reply, { ownerOnly: true });
    if (reply.sent) return;
    try {
      const username = request.body?.username?.trim() ?? "";
      const password = request.body?.password ?? "";
      if (!username || !password) {
        return reply.code(400).send({ error: "Username and password required" });
      }
      const result = await vrchatLogin({
        username,
        password,
        twoFactorCode: request.body?.twoFactorCode?.trim() || undefined,
      });
      return result;
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.post<{
    Body: { username?: string; password?: string; twoFactorCode?: string };
  }>("/admin/vrchat/2fa", async (request, reply) => {
    await requireAuth(request, reply, { ownerOnly: true });
    if (reply.sent) return;
    try {
      const username = request.body?.username?.trim() ?? "";
      const password = request.body?.password ?? "";
      const twoFactorCode = request.body?.twoFactorCode?.trim() ?? "";
      if (!username || !password || !twoFactorCode) {
        return reply
          .code(400)
          .send({ error: "Username, password, and 2FA code required" });
      }
      const result = await vrchatLogin({ username, password, twoFactorCode });
      if (result.status !== "ok") {
        return reply.code(401).send({ error: "2FA verification failed", ...result });
      }
      return result;
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.post("/admin/vrchat/logout", async (request, reply) => {
    await requireAuth(request, reply, { ownerOnly: true });
    if (reply.sent) return;
    try {
      await vrchatLogout();
      return { ok: true };
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.get("/admin/users", async (request, reply) => {
    await requireAuth(request, reply, { ownerOnly: true });
    if (reply.sent) return;
    try {
      const users = await listUsers();
      return {
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          mustChangePassword: u.must_change_password,
          isOriginalOwner: u.is_original_owner,
          createdAt: u.created_at,
        })),
      };
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.post<{
    Body: { email?: string; role?: Role };
  }>("/admin/users", async (request, reply) => {
    await requireAuth(request, reply, { ownerOnly: true });
    if (reply.sent) return;
    try {
      const email = request.body?.email?.trim() ?? "";
      const role = request.body?.role;
      if (
        !email ||
        (role !== "owner" && role !== "admin" && role !== "user")
      ) {
        return reply
          .code(400)
          .send({ error: "email and role (owner|admin|user) required" });
      }
      const created = await ownerCreateUser({ email, role });
      return {
        user: created.user,
        temporaryPassword: created.temporaryPassword,
      };
    } catch (err) {
      const { status, message } = httpError(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.delete<{ Params: { userId: string } }>(
    "/admin/users/:userId",
    async (request, reply) => {
      await requireAuth(request, reply, { ownerOnly: true });
      if (reply.sent) return;
      try {
        await ownerDeleteUser({
          actorId: request.authUser!.id,
          targetId: request.params.userId,
        });
        return { ok: true };
      } catch (err) {
        const { status, message } = httpError(err);
        return reply.code(status).send({ error: message });
      }
    },
  );

  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
