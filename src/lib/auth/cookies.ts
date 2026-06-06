import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, JWT_EXPIRY_SECONDS } from "./constants";
import { verifySessionToken, type SessionPayload } from "./session";

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
};

export function buildSessionCookieOptions(rememberMe: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(rememberMe ? { maxAge: JWT_EXPIRY_SECONDS } : {}),
  };
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  rememberMe: boolean,
): NextResponse {
  response.cookies.set(AUTH_COOKIE_NAME, token, buildSessionCookieOptions(rememberMe));
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...buildSessionCookieOptions(false),
    maxAge: 0,
  });
  return response;
}
