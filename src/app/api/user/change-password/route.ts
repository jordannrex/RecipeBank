import type { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createUserSession, revokeAllUserSessions } from "@/lib/auth/sessions";
import { passwordSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return apiError("Current password is incorrect", 401);
  }

  if (currentPassword === newPassword) {
    return apiError("New password must differ from your current password", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { passwordHash },
  });

  // Security: a password change must invalidate every existing session so a
  // stolen/old session can't survive it. We revoke them all, then mint a fresh
  // session for THIS device (preserving its remember-me preference) so the
  // user who just changed their password stays signed in here.
  const current = await prisma.session.findUnique({
    where: { id: auth.sessionId },
    select: { rememberMe: true },
  });
  const rememberMe = current?.rememberMe ?? false;

  await revokeAllUserSessions(auth.user.id);
  const { token } = await createUserSession(auth.user.id, rememberMe);

  const response = apiSuccess({ ok: true });
  return setSessionCookie(response as NextResponse, token, rememberMe);
}
