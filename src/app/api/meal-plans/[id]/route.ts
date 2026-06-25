import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMealPlanCost, formatCost, type CostIngredient } from "@/lib/cost";
import type { MealPlanDetail, MealPlanUsageRecord } from "@/types/meal-plan";

// ---------------------------------------------------------------------------
// Helpers (duplicated from route.ts for self-containment)
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toUsageRecord(u: {
  id: string; startDate: Date; endDate: Date | null;
  type: string; notes: string | null; createdAt: Date;
}): MealPlanUsageRecord {
  return {
    id: u.id,
    startDate: toDateStr(u.startDate),
    endDate: u.endDate ? toDateStr(u.endDate) : null,
    type: u.type as "planned" | "logged",
    notes: u.notes,
    createdAt: u.createdAt.toISOString(),
  };
}

function computeUsageFields(usages: MealPlanUsageRecord[]) {
  const today = localToday();
  const currentUsage = usages.find(
    (u) => u.startDate <= today && (u.endDate === null || u.endDate >= today),
  ) ?? null;
  const nextPlannedUsage = usages
    .filter((u) => u.type === "planned" && u.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const usageCount = usages.filter((u) => u.type === "logged").length;
  return { currentUsage, nextPlannedUsage, usageCount };
}

const mealPlanInclude = {
  items: {
    include: {
      recipe: {
        select: {
          id: true, title: true, photoUrl: true,
          currentServings: true, cuisine: true, dishType: true,
          servings: true,
          ingredientGroups: {
            select: {
              ingredients: {
                select: {
                  quantity: true, unit: true,
                  storePkgQty: true, storePkgUnit: true, price: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  usages: {
    orderBy: { startDate: "asc" as const },
  },
};

type MealPlanWithRelations = {
  id: string;
  title: string;
  description: string | null;
  updatedAt: Date;
  userId: string;
  items: Array<{
    id: string; sortOrder: number; servings: number;
    cookDate: Date | null; notes: string | null;
    recipe: {
      id: string; title: string; photoUrl: string | null;
      currentServings: number; cuisine: string | null; dishType: string | null;
      servings: number;
      ingredientGroups: Array<{ ingredients: CostIngredient[] }>;
    };
  }>;
  usages: Array<{
    id: string; startDate: Date; endDate: Date | null;
    type: string; notes: string | null; createdAt: Date;
  }>;
};

/** Per-item costs (aligned to mealPlan.items order) plus the mealPlan total + partial flag. */
function mealPlanCostFields(mealPlan: MealPlanWithRelations) {
  const { itemCosts, totalCost, isPartial } = computeMealPlanCost(
    mealPlan.items.map((it) => ({
      servings: it.servings,
      recipe: {
        servings: it.recipe.servings,
        ingredientGroups: it.recipe.ingredientGroups,
      },
    })),
  );
  return {
    itemCosts,
    totalCost: totalCost !== null ? formatCost(totalCost) : null,
    isPartialCost: isPartial,
  };
}

function toMealPlanDetail(mealPlan: MealPlanWithRelations): MealPlanDetail {
  const usageRecords = mealPlan.usages.map(toUsageRecord);
  const { currentUsage, nextPlannedUsage, usageCount } = computeUsageFields(usageRecords);
  const { itemCosts, totalCost, isPartialCost } = mealPlanCostFields(mealPlan);
  return {
    id: mealPlan.id,
    title: mealPlan.title,
    description: mealPlan.description,
    totalServings: mealPlan.items.reduce((sum, it) => sum + it.servings, 0),
    totalCost,
    isPartialCost,
    itemCount: mealPlan.items.length,
    recipePhotoUrls: mealPlan.items.map((it) => it.recipe.photoUrl),
    usageCount,
    currentUsage,
    nextPlannedUsage,
    updatedAt: mealPlan.updatedAt.toISOString(),
    items: mealPlan.items.map((item, i) => ({
      id: item.id,
      sortOrder: item.sortOrder,
      servings: item.servings,
      cookDate: item.cookDate ? toDateStr(item.cookDate) : null,
      notes: item.notes,
      recipe: {
        id: item.recipe.id,
        title: item.recipe.title,
        photoUrl: item.recipe.photoUrl,
        currentServings: item.recipe.currentServings,
        cuisine: item.recipe.cuisine,
        dishType: item.recipe.dishType,
        estimatedCost: itemCosts[i] !== null ? formatCost(itemCosts[i]!) : null,
      },
    })),
    allUsages: usageRecords.sort((a, b) => b.startDate.localeCompare(a.startDate)),
  };
}

const patchMealPlanSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/meal-plans/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const mealPlan = await prisma.mealPlan.findUnique({ where: { id }, include: mealPlanInclude });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  return apiSuccess(toMealPlanDetail(mealPlan as MealPlanWithRelations));
}

// ---------------------------------------------------------------------------
// PATCH /api/meal-plans/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const mealPlan = await prisma.mealPlan.findUnique({ where: { id }, select: { userId: true } });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = patchMealPlanSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { title, description } = parsed.data;

  const updated = await prisma.mealPlan.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
    },
    include: mealPlanInclude,
  });

  // Return the full detail (items + allUsages) — the detail modal's save handler
  // rehydrates its item list from this response.
  return apiSuccess(toMealPlanDetail(updated as MealPlanWithRelations));
}

// ---------------------------------------------------------------------------
// DELETE /api/meal-plans/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const mealPlan = await prisma.mealPlan.findUnique({ where: { id }, select: { userId: true } });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  await prisma.mealPlan.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
