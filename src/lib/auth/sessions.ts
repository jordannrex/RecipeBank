import { prisma } from "@/lib/db";
import { JWT_EXPIRY_SECONDS } from "./constants";
import { signSessionToken } from "./session";
import { generateToken, hashToken } from "./tokens";

export async function createUserSession(userId: string, rememberMe: boolean) {
  const sessionId = generateToken();
  const expiresAt = new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: hashToken(sessionId),
      expiresAt,
      rememberMe,
    },
  });

  const token = await signSessionToken({ userId, sessionId });
  return { token, sessionId, expiresAt };
}

export async function getValidSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function renewSession(sessionId: string) {
  const expiresAt = new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000);

  return prisma.session.update({
    where: { id: sessionId },
    data: { expiresAt },
  });
}

export async function revokeSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
