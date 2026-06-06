import { cookies } from "next/headers";
import { apiSuccess } from "@/lib/api";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { clearSessionCookie } from "@/lib/auth/cookies";
import { revokeSession } from "@/lib/auth/sessions";
import { verifySessionToken } from "@/lib/auth/session";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (payload) {
    await revokeSession(payload.sessionId);
  }

  const response = apiSuccess({ ok: true });
  return clearSessionCookie(response);
}
