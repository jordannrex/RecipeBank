/**
 * purge-deleted-accounts.ts
 *
 * Permanently deletes accounts whose 30-day deletion grace period has elapsed
 * (deletion_scheduled_at <= now). Cascades remove all of each user's data.
 *
 * Run manually or on a schedule:
 *
 *     npm run purge:deletions
 *
 * Safe to re-run — it only deletes accounts already past their grace window.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const expired = await prisma.user.findMany({
      where: { deletionScheduledAt: { not: null, lte: new Date() } },
      select: { id: true, email: true, deletionScheduledAt: true },
    });

    if (expired.length === 0) {
      console.log("[purge] No accounts are past their deletion grace period.");
      return;
    }

    const { count } = await prisma.user.deleteMany({
      where: { deletionScheduledAt: { not: null, lte: new Date() } },
    });

    console.log(`[purge] Permanently deleted ${count} account(s):`);
    for (const u of expired) {
      console.log(`  - ${u.email} (scheduled ${u.deletionScheduledAt?.toISOString()})`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[purge] Failed:", err);
  process.exit(1);
});
