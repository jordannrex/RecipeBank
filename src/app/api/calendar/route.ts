import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { realizePastScheduledMeals } from "@/lib/scheduled-meal-realize";
import type { CalendarEvent } from "@/types/calendar";
import type { MealPlanBand } from "@/types/meal-plan";

// ---------------------------------------------------------------------------
// GET /api/calendar?year=2026&month=6
//
// Returns all CookLog entries and ScheduledMeal entries for the given month,
// merged into a single CalendarEvent[] sorted by date ascending.
// Also returns mealPlanBands and meal-plan-recipe events.
// ---------------------------------------------------------------------------

const querySchema = z.object({
  year:  z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid query", 400);

  const { year, month } = parsed.data;

  // Turn any meal plans whose day has passed into real cook logs first, so the
  // calendar reflects them as logs (not lingering "planned" chips).
  await realizePastScheduledMeals(auth.user.id);

  // Build a UTC date range covering the entire month.
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate   = new Date(Date.UTC(year, month, 1)); // exclusive

  function toDateStr(d: Date): string {
    const y  = d.getUTCFullYear();
    const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  const [cookLogs, scheduledMeals, mealPlanItemsRaw, mealPlanBandsRaw] = await Promise.all([
    prisma.cookLog.findMany({
      where: {
        userId: auth.user.id,
        cookedAt: { gte: startDate, lt: endDate },
      },
      include: { recipe: { select: { title: true, photoUrl: true } } },
      orderBy: { cookedAt: "asc" },
    }),
    prisma.scheduledMeal.findMany({
      where: {
        userId: auth.user.id,
        plannedDate: { gte: startDate, lt: endDate },
      },
      include: { recipe: { select: { title: true, photoUrl: true } } },
      orderBy: { plannedDate: "asc" },
    }),
    prisma.mealPlanItem.findMany({
      where: {
        mealPlan: { userId: auth.user.id },
        cookDate: { gte: startDate, lt: endDate },
      },
      include: {
        mealPlan: { select: { id: true, title: true } },
        recipe: { select: { title: true, photoUrl: true } },
      },
      orderBy: { cookDate: "asc" },
    }),
    // MealPlanUsage bands: usages whose date range overlaps this month
    prisma.mealPlanUsage.findMany({
      where: {
        userId: auth.user.id,
        startDate: { lte: new Date(Date.UTC(year, month, 0)) },
        endDate: { not: null, gte: startDate },
      },
      select: { id: true, mealPlanId: true, startDate: true, endDate: true, mealPlan: { select: { title: true } } },
    }),
  ]);

  const events: CalendarEvent[] = [
    ...cookLogs.map((log) => ({
      id:             log.id,
      type:           "cook-log" as const,
      recipeId:       log.recipeId,
      recipeTitle:    log.recipe.title,
      recipePhotoUrl: log.recipe.photoUrl,
      date:           toDateStr(log.cookedAt),
      notes:          log.notes,
    })),
    ...scheduledMeals.map((plan) => ({
      id:             plan.id,
      type:           "scheduled-meal" as const,
      recipeId:       plan.recipeId,
      recipeTitle:    plan.recipe.title,
      recipePhotoUrl: plan.recipe.photoUrl,
      date:           toDateStr(plan.plannedDate),
      notes:          null,
    })),
    ...mealPlanItemsRaw
      .filter((item) => item.cookDate !== null)
      .map((item) => ({
        id:             item.id,
        type:           "meal-plan-recipe" as const,
        recipeId:       item.recipeId,
        recipeTitle:    item.recipe.title,
        recipePhotoUrl: item.recipe.photoUrl,
        date:           toDateStr(item.cookDate!),
        notes:          item.notes,
        mealPlanId:         item.mealPlan.id,
        mealPlanTitle:      item.mealPlan.title,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const mealPlanBands: MealPlanBand[] = mealPlanBandsRaw.map((b) => ({
    mealPlanId:    b.mealPlanId,
    title:     b.mealPlan.title,
    startDate: toDateStr(b.startDate),
    endDate:   toDateStr(b.endDate!),
  }));

  return apiSuccess({ events, mealPlanBands });
}
