import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedRecipe } from "@/lib/recipe-helpers";

const patchSchema = z.object({
  notes: z.string().trim().max(2000).nullable().transform((v) => (v ? v : null)),
});

/**
 * PATCH /api/recipes/[id]/cook-log/[logId]
 * Updates the notes on a single cook log entry.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id, logId } = await params;

  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Verify the log entry exists and belongs to this user + recipe.
  const entry = await prisma.cookLog.findUnique({ where: { id: logId } });
  if (!entry || entry.recipeId !== id) return apiError("Cook log entry not found", 404);
  if (entry.userId !== auth.user.id) return apiError("Forbidden", 403);

  const updated = await prisma.cookLog.update({
    where: { id: logId },
    data: { notes: parsed.data.notes },
  });

  return apiSuccess(updated);
}

/**
 * DELETE /api/recipes/[id]/cook-log/[logId]
 * Removes a cook log entry and keeps recipe.cookCount / lastCookedAt accurate.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id, logId } = await params;

  // Verify recipe ownership.
  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  // Verify the log entry exists and belongs to this user + recipe.
  const entry = await prisma.cookLog.findUnique({ where: { id: logId } });
  if (!entry || entry.recipeId !== id) return apiError("Cook log entry not found", 404);
  if (entry.userId !== auth.user.id) return apiError("Forbidden", 403);

  await prisma.$transaction(async (tx) => {
    await tx.cookLog.delete({ where: { id: logId } });

    // Recompute cookCount and lastCookedAt from remaining entries.
    const [count, mostRecent] = await Promise.all([
      tx.cookLog.count({ where: { recipeId: id, userId: auth.user.id } }),
      tx.cookLog.findFirst({
        where: { recipeId: id, userId: auth.user.id },
        orderBy: { cookedAt: "desc" },
        select: { cookedAt: true },
      }),
    ]);

    await tx.recipe.update({
      where: { id },
      data: {
        cookCount: count,
        lastCookedAt: mostRecent?.cookedAt ?? null,
      },
    });
  });

  return apiSuccess({ ok: true });
}
