import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// DELETE /api/scheduled-meals/[id]
// Removes a meal plan entry. Verifies ownership before deleting.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;

  const plan = await prisma.scheduledMeal.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!plan) return apiError("Not found", 404);
  if (plan.userId !== auth.user.id) return apiError("Forbidden", 403);

  await prisma.scheduledMeal.delete({ where: { id } });

  return apiSuccess({ deleted: true });
}
