import { PASSWORD_RESET_EXPIRY_HOURS } from "./constants";
import { generateToken, hashToken } from "./tokens";
import { prisma } from "@/lib/db";

export async function createPasswordResetToken(userId: string) {
  const rawToken = generateToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  return rawToken;
}

export async function findValidPasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!token || token.usedAt || token.expiresAt < new Date()) {
    return null;
  }

  return token;
}

export async function markPasswordResetTokenUsed(tokenId: string) {
  await prisma.passwordResetToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  });
}
