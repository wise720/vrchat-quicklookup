import { hashPassword } from "../auth.js";
import { createUser, ensureSchema, findUserByEmail } from "../db.js";

async function main() {
  const email = process.env.OWNER_EMAIL?.trim();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error("OWNER_EMAIL and OWNER_PASSWORD are required to seed owner");
  }
  if (password.length < 8) {
    throw new Error("OWNER_PASSWORD must be at least 8 characters");
  }

  await ensureSchema();
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.role === "owner") {
      console.log(`Owner already exists: ${existing.email}`);
      return;
    }
    throw new Error(`User ${email} exists with role ${existing.role}`);
  }

  const user = await createUser({
    email,
    passwordHash: await hashPassword(password),
    role: "owner",
    mustChangePassword: false,
    isOriginalOwner: true,
  });
  console.log(`Created original owner ${user.email} (${user.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
