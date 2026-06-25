import { prisma } from "@/lib/db";

/**
 * Turn *past* meal plans into reality.
 *
 * Any ScheduledMeal whose planned day has already gone by is converted into a real
 * CookLog with an empty note, then removed. This lets users skip the calendar's
 * Plan→Log toggle entirely: if they just let the day pass, the plan still
 * becomes a logged cook (counting toward cookCount / lastCookedAt and showing
 * up in the recipe's history). The same-day case stays manual (the toggle);
 * this only fires once the date is strictly in the past.
 *
 * Called lazily wherever plans surface (calendar API, home landing) so it
 * "just happens" the next time the user opens the app. Idempotent and safe to
 * run concurrently: each plan is claimed by its delete (count === 0 means
 * another request already realized it), so no duplicate logs are created.
 *
 * Returns the number of plans realized.
 */
export async function realizePastScheduledMeals(userId: string): Promise<number> {
  // Midnight UTC of today — plans dated strictly before this have "passed".
  // Matches how plannedDate (@db.Date) is stored and how the cook-log routes
  // compute "today" in UTC.
  const todayUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

  const duePlans = await prisma.scheduledMeal.findMany({
    where: { userId, plannedDate: { lt: todayUtc } },
    select: { id: true, recipeId: true, plannedDate: true },
    orderBy: { plannedDate: "asc" },
  });
  if (duePlans.length === 0) return 0;

  let converted = 0;
  const affectedRecipes = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const plan of duePlans) {
      // Claim the plan by deleting it; if it's already gone (a concurrent
      // request realized it first), skip so we don't create a duplicate log.
      const del = await tx.scheduledMeal.deleteMany({ where: { id: plan.id } });
      if (del.count === 0) continue;

      await tx.cookLog.create({
        data: {
          recipeId: plan.recipeId,
          userId,
          cookedAt: plan.plannedDate,
          notes: null,
        },
      });
      affectedRecipes.add(plan.recipeId);
      converted++;
    }

    // Recompute cookCount / lastCookedAt for each touched recipe.
    for (const recipeId of affectedRecipes) {
      const [count, mostRecent] = await Promise.all([
        tx.cookLog.count({ where: { recipeId, userId } }),
        tx.cookLog.findFirst({
          where: { recipeId, userId },
          orderBy: { cookedAt: "desc" },
          select: { cookedAt: true },
        }),
      ]);
      await tx.recipe.update({
        where: { id: recipeId },
        data: { cookCount: count, lastCookedAt: mostRecent?.cookedAt ?? null },
      });
    }
  });

  return converted;
}
