import { Router } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, registerSchema } from "@slp/shared";
import { AppError, asyncHandler, parse } from "../errors";
import { User, toPublicUser } from "../models/User";
import { StudentProfile } from "../models/StudentProfile";
import { RefreshToken } from "../models/RefreshToken";
import { config } from "../config";
import { REFRESH_COOKIE, clearSession, issueSession, verifyRefreshToken } from "../auth/tokens";
import { authenticate } from "../middleware/auth";

export const authRouter = Router();

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 4);

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = parse(registerSchema, req.body);
    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
    let user;
    try {
      // Public sign-up always creates students; mentors/admins are created via script/admin tools.
      user = await User.create({
        name: input.name,
        email: input.email,
        passwordHash,
        role: "student",
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
      }
      throw e;
    }
    await StudentProfile.create({ userId: user._id });
    await issueSession(res, String(user._id), user.role);
    res.status(201).json({ user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = await User.findOne({ email: input.email });
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    await issueSession(res, String(user._id), user.role);
    res.json({ user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new AppError(401, "UNAUTHENTICATED", "No refresh token");
    let claims;
    try {
      claims = verifyRefreshToken(token);
    } catch {
      clearSession(res);
      throw new AppError(401, "INVALID_TOKEN", "Invalid or expired refresh token");
    }
    // Rotation: each refresh token is single-use. A valid signature with no stored record means
    // the token was already used or revoked, so treat it as theft and end all of the user's sessions.
    const stored = await RefreshToken.findOneAndDelete({ jti: claims.jti });
    if (!stored) {
      await RefreshToken.deleteMany({ userId: claims.sub });
      clearSession(res);
      throw new AppError(401, "TOKEN_REUSED", "Refresh token is no longer valid");
    }
    const user = await User.findById(claims.sub);
    if (!user) {
      clearSession(res);
      throw new AppError(401, "UNAUTHENTICATED", "User no longer exists");
    }
    await issueSession(res, String(user._id), user.role);
    res.json({ user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      try {
        await RefreshToken.deleteOne({ jti: verifyRefreshToken(token).jti });
      } catch {
        /* expired or malformed: nothing to revoke */
      }
    }
    clearSession(res);
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId);
    if (!user) throw new AppError(401, "UNAUTHENTICATED", "User no longer exists");
    res.json({ user: toPublicUser(user) });
  }),
);
