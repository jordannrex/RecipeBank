import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

// Schedule account for deletion (30-day grace period).
export async function DELETE() {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const deletionScheduledAt = new Date(
    Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { deletionScheduledAt },
  });

  return apiSuccess({ deletionScheduledAt });
}

// Cancel a pending deletion.
export async function POST() {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  if (!auth.user.deletionScheduledAt) {
    return apiError("No deletion is scheduled for this account", 400);
  }

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { deletionScheduledAt: null },
  });

  return apiSuccess({ ok: true });
}
