import { Schema, model, type InferSchemaType } from "mongoose";
import { ROLES, type PublicUser } from "@slp/shared";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: "student", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const User = model("User", userSchema);

export function toPublicUser(u: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role as PublicUser["role"],
    createdAt: u.createdAt.toISOString(),
  };
}
