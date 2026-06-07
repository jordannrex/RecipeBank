import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// POST /api/meal-plans
// Creates a future meal plan entry. plannedDate must be strictly in the future
// (tomorrow or later) — past/today dates should use the cook-log endpoint.
// ---------------------------------------------------------------------------

const createSchema = z.object({
  recipeId:    z.string().min(1),
  plannedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "plannedDate must be YYYY-MM-DD"),
});

export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { recipeId, plannedDate } = parsed.data;

  // Verify recipe ownership
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true, title: true, photoUrl: true },
  });
  if (!recipe || recipe.userId !== auth.user.id) return apiError("Recipe not found", 404);

  const plan = await prisma.mealPlan.create({
    data: {
      userId:      auth.user.id,
      recipeId,
      plannedDate: new Date(plannedDate),
    },
    select: { id: true, recipeId: true, plannedDate: true },
  });

  return apiSuccess(
    {
      id:             plan.id,
      type:           "meal-plan" as const,
      recipeId:       plan.recipeId,
      recipeTitle:    recipe.title,
      recipePhotoUrl: recipe.photoUrl,
      date:           plannedDate,
      notes:          null,
    },
    201,
  );
}
