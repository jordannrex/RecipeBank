import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/sessions";
import { toAuthUser } from "@/lib/auth/user";
import { registerSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`register:${ip}`, RATE_LIMIT);

  if (!rl.success) {
    return apiError("Too many registration attempts. Please try again later.", 429);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { email, username, displayName, password } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
    },
    select: { email: true, username: true },
  });

  if (existing) {
    if (existing.email.toLowerCase() === email.toLowerCase()) {
      return apiError("An account with this email already exists", 409);
    }
    return apiError("This username is already taken", 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      displayName,
      passwordHash,
    },
  });

  const { token } = await createUserSession(user.id, false);

  const response = apiSuccess(toAuthUser(user), 201);
  return setSessionCookie(response as NextResponse, token, false);
}
