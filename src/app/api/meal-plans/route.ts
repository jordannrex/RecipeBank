import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMealPlanCost, formatCost, type CostIngredient } from "@/lib/cost";
import type { MealPlanDetail, MealPlanSummary, MealPlanUsageRecord } from "@/types/meal-plan";

// ---------------------------------------------------------------------------
// Helpers
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

function toMealPlanSummary(mealPlan: MealPlanWithRelations): MealPlanSummary {
  const { totalCost, isPartialCost } = mealPlanCostFields(mealPlan);
  const usageRecords = mealPlan.usages.map(toUsageRecord);
  const { currentUsage, nextPlannedUsage, usageCount } = computeUsageFields(usageRecords);
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
  };
}

function toMealPlanDetail(mealPlan: MealPlanWithRelations): MealPlanDetail {
  const summary = toMealPlanSummary(mealPlan);
  const { itemCosts } = mealPlanCostFields(mealPlan);
  return {
    ...summary,
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
    allUsages: mealPlan.usages.map(toUsageRecord).sort(
      (a, b) => b.startDate.localeCompare(a.startDate),
    ),
  };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createMealPlanSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().nullable().optional(),
  items: z.array(z.object({
    recipeId: z.string().min(1),
    servings: z.number().int().min(1).optional(),
    cookDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).max(10).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/meal-plans
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const mealPlans = await prisma.mealPlan.findMany({
    where: { userId: auth.user.id },
    include: mealPlanInclude,
    orderBy: { updatedAt: "desc" },
  });

  const summaries: MealPlanSummary[] = mealPlans.map((m) => toMealPlanSummary(m as MealPlanWithRelations));
  return apiSuccess(summaries);
}

// ---------------------------------------------------------------------------
// POST /api/meal-plans
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = createMealPlanSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { title, description, items } = parsed.data;

  if (items && items.length > 10) return apiError("A mealPlan can have at most 10 recipes", 400);

  const recipeIds = (items ?? []).map((it) => it.recipeId);
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: recipeIds }, userId: auth.user.id },
    select: { id: true, currentServings: true },
  });
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  for (const recipeId of recipeIds) {
    if (!recipeMap.has(recipeId)) return apiError(`Recipe ${recipeId} not found`, 404);
  }

  const mealPlan = await prisma.mealPlan.create({
    data: {
      userId: auth.user.id,
      title,
      description: description ?? null,
      items: items && items.length > 0 ? {
        create: items.map((item, idx) => ({
          recipeId: item.recipeId,
          servings: item.servings ?? recipeMap.get(item.recipeId)!.currentServings,
          cookDate: item.cookDate ? new Date(item.cookDate) : null,
          sortOrder: idx,
        })),
      } : undefined,
    },
    include: mealPlanInclude,
  });

  return apiSuccess(toMealPlanDetail(mealPlan as MealPlanWithRelations), 201);
}
