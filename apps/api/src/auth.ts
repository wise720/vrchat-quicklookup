import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AuthUser, Role } from "@vrchat-quicklookup/shared";
import { hasMinRole } from "@vrchat-quicklookup/shared";
import {
  createUser,
  findUserByEmail,
  findUserById,
  updatePassword,
  countOwners,
  deleteUserById,
  type DbUser,
} from "./db.js";

function jwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export function toAuthUser(user: DbUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.must_change_password,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateThrowawayPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, jwtSecret());
  const id = payload.sub;
  if (!id) throw new Error("Invalid token");
  const user = await findUserById(id);
  if (!user) throw new Error("User not found");
  return toAuthUser(user);
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }
  const authUser = toAuthUser(user);
  const token = await signToken(authUser);
  return { user: authUser, token };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw Object.assign(new Error("Current password is incorrect"), {
      status: 400,
    });
  }
  if (newPassword.length < 8) {
    throw Object.assign(new Error("New password must be at least 8 characters"), {
      status: 400,
    });
  }
  await updatePassword(userId, await hashPassword(newPassword), false);
  const updated = await findUserById(userId);
  return toAuthUser(updated!);
}

export async function ownerCreateUser(params: {
  email: string;
  role: Role;
}): Promise<{ user: AuthUser; temporaryPassword: string }> {
  if (params.role !== "owner" && params.role !== "admin" && params.role !== "user") {
    throw Object.assign(new Error("Invalid role"), { status: 400 });
  }
  const existing = await findUserByEmail(params.email);
  if (existing) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }
  const temporaryPassword = generateThrowawayPassword();
  const user = await createUser({
    email: params.email,
    passwordHash: await hashPassword(temporaryPassword),
    role: params.role,
    mustChangePassword: true,
  });
  return { user: toAuthUser(user), temporaryPassword };
}

export async function ownerDeleteUser(params: {
  actorId: string;
  targetId: string;
}): Promise<void> {
  if (params.actorId === params.targetId) {
    throw Object.assign(new Error("You cannot delete your own account"), {
      status: 400,
    });
  }
  const target = await findUserById(params.targetId);
  if (!target) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  if (target.is_original_owner) {
    throw Object.assign(new Error("Cannot delete the original owner"), {
      status: 400,
    });
  }
  if (target.role === "owner" && (await countOwners()) <= 1) {
    throw Object.assign(new Error("Cannot delete the last owner"), {
      status: 400,
    });
  }
  const deleted = await deleteUserById(params.targetId);
  if (!deleted) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
}

export function assertRole(user: AuthUser, required: Role) {
  if (!hasMinRole(user.role, required)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}

export function assertOwner(user: AuthUser) {
  if (user.role !== "owner") {
    throw Object.assign(new Error("Owner only"), { status: 403 });
  }
}
