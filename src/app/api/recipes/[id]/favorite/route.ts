import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedRecipe } from "@/lib/recipe-helpers";

/**
 * PATCH /api/recipes/[id]/favorite
 * Toggles isFavorite on the recipe. Returns the new value.
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { recipe, error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  const updated = await prisma.recipe.update({
    where: { id },
    data: { isFavorite: !recipe!.isFavorite },
    select: { id: true, isFavorite: true },
  });

  return apiSuccess(updated);
}
