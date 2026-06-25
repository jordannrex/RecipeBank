import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// DELETE /api/meal-plans/[id]/usages/[usageId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; usageId: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id, usageId } = await params;

  const usage = await prisma.mealPlanUsage.findUnique({
    where: { id: usageId },
    select: { mealPlanId: true, userId: true },
  });
  if (!usage) return apiError("Usage not found", 404);
  if (usage.mealPlanId !== id || usage.userId !== auth.user.id) return apiError("Forbidden", 403);

  await prisma.mealPlanUsage.delete({ where: { id: usageId } });
  return apiSuccess({ deleted: true });
}
