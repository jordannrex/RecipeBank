import { apiError, apiSuccess } from "@/lib/api";
import { purgeExpiredAccounts } from "@/lib/account-purge";

/**
 * POST /api/cron/purge-deletions
 *
 * Permanently removes accounts whose 30-day deletion grace period has elapsed.
 * Intended to be called on a schedule (e.g. a Railway cron job) with:
 *
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Protected by the CRON_SECRET env var so it can't be triggered anonymously.
 * If CRON_SECRET is unset the endpoint is disabled (returns 503) rather than
 * running unauthenticated.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return apiError("Purge endpoint is not configured", 503);

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) return apiError("Unauthorized", 401);

  const purged = await purgeExpiredAccounts();
  return apiSuccess({ purged });
}
