import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { CalendarEvent } from "@/types/calendar";

// ---------------------------------------------------------------------------
// GET /api/calendar?year=2026&month=6
//
// Returns all CookLog entries and MealPlan entries for the given month,
// merged into a single CalendarEvent[] sorted by date ascending.
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

  // Build a UTC date range covering the entire month.
  // DB stores dates as @db.Date (midnight UTC).
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate   = new Date(Date.UTC(year, month, 1)); // exclusive

  const [cookLogs, mealPlans] = await Promise.all([
    prisma.cookLog.findMany({
      where: {
        userId: auth.user.id,
        cookedAt: { gte: startDate, lt: endDate },
      },
      include: { recipe: { select: { title: true, photoUrl: true } } },
      orderBy: { cookedAt: "asc" },
    }),
    prisma.mealPlan.findMany({
      where: {
        userId: auth.user.id,
        plannedDate: { gte: startDate, lt: endDate },
      },
      include: { recipe: { select: { title: true, photoUrl: true } } },
      orderBy: { plannedDate: "asc" },
    }),
  ]);

  function toDateStr(d: Date): string {
    // DB Date fields are stored as midnight UTC; format as YYYY-MM-DD
    const year  = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day   = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

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
    ...mealPlans.map((plan) => ({
      id:             plan.id,
      type:           "meal-plan" as const,
      recipeId:       plan.recipeId,
      recipeTitle:    plan.recipe.title,
      recipePhotoUrl: plan.recipe.photoUrl,
      date:           toDateStr(plan.plannedDate),
      notes:          null,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return apiSuccess({ events });
}
