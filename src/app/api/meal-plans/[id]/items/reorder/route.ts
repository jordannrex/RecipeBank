import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const reorderSchema = z.object({
  order: z.array(z.string().min(1)),
});

// ---------------------------------------------------------------------------
// PATCH /api/meal-plans/[id]/items/reorder
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id: mealPlanId } = await params;

  const mealPlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    include: { items: { select: { id: true } } },
  });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { order } = parsed.data;

  // Validate all ids belong to this mealPlan
  const mealPlanItemIds = new Set(mealPlan.items.map((it) => it.id));
  for (const itemId of order) {
    if (!mealPlanItemIds.has(itemId)) return apiError(`Item ${itemId} does not belong to this mealPlan`, 400);
  }

  // Bulk update sort orders
  await Promise.all(
    order.map((itemId, idx) =>
      prisma.mealPlanItem.update({
        where: { id: itemId },
        data: { sortOrder: idx },
      })
    )
  );

  return apiSuccess({ reordered: true });
}
