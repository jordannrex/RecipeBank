import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/sessions";
import { toAuthUser } from "@/lib/auth/user";
import { loginSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { identifier, password, rememberMe } = parsed.data;
  const normalizedIdentifier = identifier.toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
    },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return apiError("Invalid email/username or password", 401);
  }

  const { token } = await createUserSession(user.id, rememberMe);

  const response = apiSuccess(toAuthUser(user));
  return setSessionCookie(response as NextResponse, token, rememberMe);
}
