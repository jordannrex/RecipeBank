import { apiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import type { AuthUser } from "@/types/auth";
import { getSession } from "./auth/cookies";
import { getValidSession, renewSession, shouldRenewSession } from "./auth/sessions";
import { toAuthUser } from "./auth/user";

export type AuthContext = {
  user: AuthUser;
  sessionId: string;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const auth = await withAuth();
  return auth?.user ?? null;
}

export async function withAuth(): Promise<AuthContext | null> {
  const payload = await getSession();
  if (!payload) {
    return null;
  }

  const session = await getValidSession(payload.sessionToken);
  if (!session || session.userId !== payload.userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user) {
    return null;
  }

  if (shouldRenewSession(session)) {
    await renewSession(session.id);
  }

  return {
    user: toAuthUser(user),
    sessionId: session.id,
  };
}

type AuthenticatedHandler = (
  request: Request,
  auth: AuthContext,
) => Promise<Response> | Response;

export function withAuthHandler(handler: AuthenticatedHandler) {
  return async (request: Request) => {
    const auth = await withAuth();

    if (!auth) {
      return apiError("Unauthorized", 401);
    }

    return handler(request, auth);
  };
}
