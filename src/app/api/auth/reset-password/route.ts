import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { findValidPasswordResetToken } from "@/lib/auth/password-reset";
import { passwordSchema } from "@/lib/auth/validation";
import { revokeAllUserSessions } from "@/lib/auth/sessions";
import { prisma } from "@/lib/db";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { token, password } = parsed.data;
  const resetToken = await findValidPasswordResetToken(token);

  if (!resetToken) {
    return apiError("This reset link is invalid or has expired", 400);
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await revokeAllUserSessions(resetToken.userId);

  return apiSuccess({ message: "Password updated successfully" });
}
