import { prisma } from "@/lib/db";

/**
 * Permanently delete every account whose 30-day deletion grace period has
 * elapsed. Cascades remove all of the user's recipes, menus, shopping lists,
 * sessions, etc. Returns the number of accounts purged.
 *
 * Invoked by the protected cron endpoint (POST /api/cron/purge-deletions) and
 * by the `npm run purge:deletions` script.
 */
export async function purgeExpiredAccounts(): Promise<number> {
  const result = await prisma.user.deleteMany({
    where: {
      deletionScheduledAt: { not: null, lte: new Date() },
    },
  });
  return result.count;
}
