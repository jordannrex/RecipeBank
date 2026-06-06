import { SignJWT, jwtVerify } from "jose";
import { AUTH_COOKIE_NAME, JWT_EXPIRY_SECONDS } from "./constants";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  sessionToken: string;
};

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${JWT_EXPIRY_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId !== "string" || typeof payload.sessionToken !== "string") {
      return null;
    }
    return { userId: payload.userId, sessionToken: payload.sessionToken };
  } catch {
    return null;
  }
}

export { AUTH_COOKIE_NAME };
