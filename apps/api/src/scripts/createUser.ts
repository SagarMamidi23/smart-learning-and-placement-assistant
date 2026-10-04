/**
 * Create a mentor or admin account (public sign-up only creates students).
 * Usage: npm run create-user -w @slp/api -- <email> <name> <role> <password>
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { ROLES, registerSchema, type Role } from "@slp/shared";
import { config } from "../config";
import { connectDb } from "../db";
import { User } from "../models/User";

async function main() {
  const [email, name, role, password] = process.argv.slice(2);
  if (!ROLES.includes(role as Role)) throw new Error(`role must be one of ${ROLES.join(", ")}`);
  const input = registerSchema.parse({ email, name, password });
  await connectDb();
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  await User.updateOne(
    { email: input.email },
    { $set: { name: input.name, role, passwordHash } },
    { upsert: true },
  );
  console.log(`${role} ${input.email} ready`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
