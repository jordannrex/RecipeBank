import { prisma } from "@/lib/db";

/**
 * Build the text blob used for recipe embedding generation.
 * Concatenates: title + description + ingredients + dish_type + cuisine + flavor_profile
 */
export function buildEmbeddingText(recipe: {
  title: string;
  description?: string | null;
  dishType?: string | null;
  cuisine?: string | null;
  flavorProfile?: string | null;
  ingredientGroups?: Array<{
    ingredients: Array<{ name: string; preparation?: string | null }>;
  }>;
}): string {
  const ingredientText =
    recipe.ingredientGroups
      ?.flatMap((g) => g.ingredients.map((i) => [i.name, i.preparation].filter(Boolean).join(" ")))
      .join(", ") ?? "";

  return [
    recipe.title,
    recipe.description,
    ingredientText,
    recipe.dishType,
    recipe.cuisine,
    recipe.flavorProfile,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Semantic search via pgvector cosine similarity.
 * Requires OPENAI_API_KEY for query embedding generation (to be wired in API route).
 */
export async function searchRecipesByEmbedding(
  userId: string,
  queryEmbedding: number[],
  limit = 20,
): Promise<Array<{ id: string; similarity: number }>> {
  const vectorString = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRawUnsafe<Array<{ id: string; similarity: number }>>(
    `
    SELECT id, 1 - (embedding <=> $1::vector) AS similarity
    FROM recipes
    WHERE user_id = $2 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    vectorString,
    userId,
    limit,
  );

  return results;
}
