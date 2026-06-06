import { apiError } from "@/lib/api";
import { prisma } from "@/lib/db";

/**
 * Fetches a recipe and verifies ownership.
 * Returns { recipe, error: null } on success or { recipe: null, error: Response } on failure.
 */
export async function getOwnedRecipe(id: string, userId: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id } });
  if (!recipe) return { recipe: null, error: apiError("Recipe not found", 404) };
  if (recipe.userId !== userId) return { recipe: null, error: apiError("Forbidden", 403) };
  return { recipe, error: null };
}
