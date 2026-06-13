import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { CalendarEvent } from "@/types/calendar";

// ---------------------------------------------------------------------------
// POST /api/calendar/convert-to-log
//
// Converts a *planned* calendar entry into an actual cook log on its planned
// day. Two sources are supported:
//   - "meal-plan":   deletes the MealPlan row.
//   - "menu-recipe": clears that MenuItem's cookDate (keeps the recipe in its
//                    menu but unschedules this date) so the calendar shows the
//                    cook log instead of a duplicate planned chip.
//
// In both cases a CookLog is created through the normal path, so recipe
// cookCount / lastCookedAt update and the cook shows up everywhere (recipe
// page history, home, cards). One-way: there is no un-convert here.
//
// The UI only exposes this on the planned day; the server additionally refuses
// to log a meal whose planned day is still in the future.
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  source: z.enum(["meal-plan", "menu-recipe"]),
  id:     z.string().min(1),
  notes:  z.string().max(5_000).nullable().optional(),
});

function toDateStr(d: Date): string {
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { source, id, notes } = parsed.data;

  // Resolve the planned entry → recipe + date, verifying ownership.
  let recipeId: string;
  let cookedAt: Date;
  let recipeTitle: string;
  let recipePhotoUrl: string | null;

  if (source === "meal-plan") {
    const plan = await prisma.mealPlan.findUnique({
      where: { id },
      select: {
        userId: true,
        recipeId: true,
        plannedDate: true,
        recipe: { select: { title: true, photoUrl: true } },
      },
    });
    if (!plan) return apiError("Planned meal not found", 404);
    if (plan.userId !== auth.user.id) return apiError("Forbidden", 403);
    recipeId       = plan.recipeId;
    cookedAt       = plan.plannedDate;
    recipeTitle    = plan.recipe.title;
    recipePhotoUrl = plan.recipe.photoUrl;
  } else {
    const item = await prisma.menuItem.findUnique({
      where: { id },
      select: {
        cookDate: true,
        recipeId: true,
        menu:   { select: { userId: true } },
        recipe: { select: { title: true, photoUrl: true } },
      },
    });
    if (!item) return apiError("Menu item not found", 404);
    if (item.menu.userId !== auth.user.id) return apiError("Forbidden", 403);
    if (!item.cookDate) return apiError("This menu item isn't scheduled on a day", 400);
    recipeId       = item.recipeId;
    cookedAt       = item.cookDate;
    recipeTitle    = item.recipe.title;
    recipePhotoUrl = item.recipe.photoUrl;
  }

  // A cook log records something that already happened — never the future.
  // Compare as UTC date strings to match @db.Date storage.
  const todayStr = new Date().toISOString().slice(0, 10);
  const dateStr  = toDateStr(cookedAt);
  if (dateStr > todayStr) {
    return apiError("You can only log a meal once its planned day has arrived", 400);
  }

  const log = await prisma.$transaction(async (tx) => {
    const created = await tx.cookLog.create({
      data: { recipeId, userId: auth.user.id, cookedAt, notes: notes ?? null },
    });

    if (source === "meal-plan") {
      await tx.mealPlan.delete({ where: { id } });
    } else {
      // Unschedule only this calendar instance; the recipe stays in its menu.
      await tx.menuItem.update({ where: { id }, data: { cookDate: null } });
    }

    // Keep cookCount / lastCookedAt in sync (mirrors the cook-log POST route).
    const mostRecent = await tx.cookLog.findFirst({
      where: { recipeId, userId: auth.user.id },
      orderBy: { cookedAt: "desc" },
      select: { cookedAt: true },
    });
    await tx.recipe.update({
      where: { id: recipeId },
      data: {
        cookCount:    { increment: 1 },
        lastCookedAt: mostRecent?.cookedAt ?? cookedAt,
      },
    });

    return created;
  });

  const event: CalendarEvent = {
    id:             log.id,
    type:           "cook-log",
    recipeId,
    recipeTitle,
    recipePhotoUrl,
    date:           dateStr,
    notes:          log.notes,
  };

  return apiSuccess(event, 201);
}
