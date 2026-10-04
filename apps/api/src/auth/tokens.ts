import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { CookieOptions, Response } from "express";
import type { Role } from "@slp/shared";
import { config } from "../config";
import { RefreshToken } from "../models/RefreshToken";

export const ACCESS_COOKIE = "slp_access";
export const REFRESH_COOKIE = "slp_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

export interface AccessPayload {
  sub: string;
  role: Role;
}

export const signAccessToken = (userId: string, role: Role) =>
  jwt.sign({ role }, config.jwt.accessSecret, { subject: userId, expiresIn: config.jwt.accessTtl });

export function verifyAccessToken(token: string): AccessPayload {
  const p = jwt.verify(token, config.jwt.accessSecret) as jwt.JwtPayload;
  return { sub: String(p.sub), role: p.role as Role };
}

export function verifyRefreshToken(token: string): { sub: string; jti: string } {
  const p = jwt.verify(token, config.jwt.refreshSecret) as jwt.JwtPayload;
  if (!p.sub || !p.jti) throw new Error("malformed refresh token");
  return { sub: p.sub, jti: p.jti };
}

const baseCookie = (): CookieOptions => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: "lax",
});

/** Creates a new access + refresh pair and sets them as httpOnly cookies. */
export async function issueSession(res: Response, userId: string, role: Role) {
  const jti = randomUUID();
  const refresh = jwt.sign({}, config.jwt.refreshSecret, {
    subject: userId,
    jwtid: jti,
    expiresIn: config.jwt.refreshTtl,
  });
  await RefreshToken.create({
    jti,
    userId,
    expiresAt: new Date(Date.now() + config.jwt.refreshTtl * 1000),
  });
  res.cookie(ACCESS_COOKIE, signAccessToken(userId, role), {
    ...baseCookie(),
    path: "/",
    maxAge: config.jwt.accessTtl * 1000,
  });
  res.cookie(REFRESH_COOKIE, refresh, {
    ...baseCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: config.jwt.refreshTtl * 1000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: REFRESH_COOKIE_PATH });
}
