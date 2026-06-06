import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";

export async function GET() {
  const auth = await withAuth();

  if (!auth) {
    return apiError("Unauthorized", 401);
  }

  return apiSuccess(auth.user);
}
