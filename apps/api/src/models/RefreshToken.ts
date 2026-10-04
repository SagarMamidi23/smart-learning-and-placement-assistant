import { Schema, model } from "mongoose";

const refreshTokenSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
