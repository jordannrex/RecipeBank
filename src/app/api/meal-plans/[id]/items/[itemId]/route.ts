import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeIngredientsCost, formatCost } from "@/lib/cost";

function toDateStr(d: Date): string {
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const patchItemSchema = z.object({
  servings: z.number().int().min(1).optional(),
  cookDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// PATCH /api/meal-plans/[id]/items/[itemId]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id: mealPlanId, itemId } = await params;

  const mealPlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: { userId: true },
  });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  const existingItem = await prisma.mealPlanItem.findUnique({
    where: { id: itemId },
    select: { mealPlanId: true },
  });
  if (!existingItem || existingItem.mealPlanId !== mealPlanId) return apiError("Item not found", 404);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = patchItemSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { servings, cookDate, notes, sortOrder } = parsed.data;

  const updated = await prisma.mealPlanItem.update({
    where: { id: itemId },
    data: {
      ...(servings !== undefined ? { servings: Math.max(1, servings) } : {}),
      ...(cookDate !== undefined ? { cookDate: cookDate ? new Date(cookDate) : null } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
    include: {
      recipe: {
        select: {
          id: true, title: true, photoUrl: true, currentServings: true, cuisine: true, dishType: true,
          servings: true,
          ingredientGroups: {
            select: {
              ingredients: {
                select: { quantity: true, unit: true, storePkgQty: true, storePkgUnit: true, price: true },
              },
            },
          },
        },
      },
    },
  });

  const base = updated.recipe.servings > 0 ? updated.recipe.servings : 1;
  const { cost } = computeIngredientsCost(
    updated.recipe.ingredientGroups.flatMap((g) => g.ingredients),
    updated.servings / base,
  );

  return apiSuccess({
    id: updated.id,
    sortOrder: updated.sortOrder,
    servings: updated.servings,
    cookDate: updated.cookDate ? toDateStr(updated.cookDate) : null,
    notes: updated.notes,
    recipe: {
      id: updated.recipe.id,
      title: updated.recipe.title,
      photoUrl: updated.recipe.photoUrl,
      currentServings: updated.recipe.currentServings,
      cuisine: updated.recipe.cuisine,
      dishType: updated.recipe.dishType,
      estimatedCost: cost !== null ? formatCost(cost) : null,
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/meal-plans/[id]/items/[itemId]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id: mealPlanId, itemId } = await params;

  const mealPlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: { userId: true },
  });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  const item = await prisma.mealPlanItem.findUnique({
    where: { id: itemId },
    select: { mealPlanId: true },
  });
  if (!item || item.mealPlanId !== mealPlanId) return apiError("Item not found", 404);

  await prisma.mealPlanItem.delete({ where: { id: itemId } });
  return apiSuccess({ deleted: true });
}
