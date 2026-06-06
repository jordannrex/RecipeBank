import { prisma } from "@/lib/db";
import { JWT_EXPIRY_SECONDS } from "./constants";
import { signSessionToken } from "./jwt";
import { generateToken, hashToken } from "./tokens";

// Only renew when less than half the window remains — avoids a DB write on every request.
const RENEWAL_THRESHOLD_MS = (JWT_EXPIRY_SECONDS / 2) * 1000;

export async function createUserSession(userId: string, rememberMe: boolean) {
  const rawToken = generateToken();
  const expiresAt = new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000);

  // id intentionally omitted — Prisma generates a cuid. The raw token is never
  // stored in the DB; only its sha256 hash is persisted so a DB dump yields no
  // usable session tokens.
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
      rememberMe,
    },
  });

  const token = await signSessionToken({ userId, sessionToken: rawToken });
  return { token };
}

export async function getValidSession(rawToken: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export function shouldRenewSession(session: { expiresAt: Date }): boolean {
  return session.expiresAt.getTime() - Date.now() < RENEWAL_THRESHOLD_MS;
}

export async function renewSession(dbSessionId: string) {
  const expiresAt = new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000);
  return prisma.session.update({
    where: { id: dbSessionId },
    data: { expiresAt },
  });
}

export async function revokeSession(rawToken: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
