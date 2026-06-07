import { TaskType } from "@google/generative-ai";
import { prisma } from "@/lib/db";
import { getGemini } from "@/lib/gemini";

// ---------------------------------------------------------------------------
// AI description generation
// ---------------------------------------------------------------------------

/**
 * Asks Gemini to write a 2–3 sentence semantic description for a recipe.
 * The description is optimised for embedding quality: it names the main
 * protein/ingredients, cooking technique, flavor profile, cuisine, and
 * serving occasion — all things a user might phrase in a natural-language
 * search query.
 *
 * Returns null on failure so callers can skip gracefully.
 */
export async function generateAiDescription(recipe: {
  title: string;
  cuisine?: string | null;
  dishType?: string | null;
  flavorProfile?: string | null;
  ingredientGroups?: Array<{ ingredients: Array<{ name: string; quantity?: string | Decimal | null; unit?: string | null }> }>;
  steps?: Array<{ body: string }>;
}): Promise<string | null> {
  const ingredientNames = recipe.ingredientGroups
    ?.flatMap((g) => g.ingredients.map((i) => i.name))
    .filter(Boolean)
    .slice(0, 20)
    .join(", ");

  const stepSummary = recipe.steps
    ?.slice(0, 4)
    .map((s, i) => `${i + 1}. ${s.body.slice(0, 80)}`)
    .join(" ");

  const lines = [
    `Recipe title: ${recipe.title}`,
    ingredientNames && `Ingredients: ${ingredientNames}`,
    stepSummary && `Steps: ${stepSummary}`,
    recipe.cuisine && `Cuisine: ${recipe.cuisine}`,
    recipe.dishType && `Dish type: ${recipe.dishType}`,
    recipe.flavorProfile && `Flavor: ${recipe.flavorProfile}`,
  ].filter(Boolean).join("\n");

  const prompt = `You are writing a concise recipe description for a cooking app's search index. Based on the recipe below, write 2–3 sentences that capture what this dish is. Cover the main protein or key ingredients, the cooking technique, the flavor profile, the cuisine style, and when someone would serve it. Write naturally, as if describing the dish to someone deciding what to cook tonight. Be specific — name key ingredients and describe the taste.

${lines}

Return only the description text. No title, no labels, no extra commentary.`;

  try {
    const model = getGemini().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 256,
        // @ts-expect-error — thinkingConfig valid for gemini-2.5-flash, not yet in SDK types
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || null;
  } catch (err) {
    console.error("[embeddings] AI description generation failed:", err);
    return null;
  }
}

// Decimal type alias (Prisma uses this for numeric fields)
type Decimal = { toString(): string };

// gemini-embedding-001 with outputDimensionality:768 — matches schema `vector(768)`
const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Generate a 768-dimensional embedding for the given text string.
 * Returns null (and logs) rather than throwing so callers can treat it as
 * a non-fatal background operation.
 */
export async function generateEmbedding(text: string, isQuery = false): Promise<number[] | null> {
  try {
    const model = getGemini().getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { parts: [{ text: text.slice(0, 8000) }], role: "user" },
      taskType: isQuery ? TaskType.RETRIEVAL_QUERY : TaskType.RETRIEVAL_DOCUMENT,
      outputDimensionality: 768,
    } as Parameters<typeof model.embedContent>[0]);
    return result.embedding.values;
  } catch (err) {
    console.error("[embeddings] generateEmbedding failed:", err);
    return null;
  }
}

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
 * Minimum cosine similarity to consider a recipe a meaningful match.
 * Scores below this mean the query and recipe are not semantically related.
 * Food embeddings cluster tightly (0.55–0.70), so 0.63 filters out noise
 * while still capturing genuinely relevant results.
 */
const SIMILARITY_THRESHOLD = 0.63;

/**
 * Semantic search via pgvector cosine similarity.
 * Only returns recipes that clear the similarity threshold —
 * callers should fall back to text search when the result set is empty.
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
    WHERE user_id = $2
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> $1::vector) >= $4
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    vectorString,
    userId,
    limit,
    SIMILARITY_THRESHOLD,
  );

  return results;
}

// ---------------------------------------------------------------------------
// Background embedding pipeline
// ---------------------------------------------------------------------------

type RecipeForEmbed = {
  id: string;
  title: string;
  description?: string | null;
  cuisine?: string | null;
  dishType?: string | null;
  flavorProfile?: string | null;
  ingredientGroups?: Array<{ ingredients: Array<{ name: string; quantity?: string | Decimal | null; unit?: string | null }> }>;
  steps?: Array<{ body: string }>;
};

/**
 * Runs the full embedding pipeline for a recipe, non-blocking.
 *
 * Steps:
 *   1. If the recipe has no description, ask Gemini to generate one and
 *      save it to the DB — this improves semantic search quality without
 *      requiring any work from the user.
 *   2. Build the embedding text (now including the description).
 *   3. Generate and store the embedding vector.
 *
 * All failures are logged and swallowed so callers are never affected.
 */
export function embedRecipeInBackground(recipe: RecipeForEmbed): void {
  (async () => {
    try {
      let description = recipe.description ?? null;

      // Step 1 — generate AI description if the recipe doesn't have one
      if (!description?.trim()) {
        const aiDesc = await generateAiDescription(recipe);
        if (aiDesc) {
          description = aiDesc;
          await prisma.recipe.update({
            where: { id: recipe.id },
            data: { description: aiDesc },
          });
          console.log(`[embeddings] AI description saved for recipe ${recipe.id}`);
        }
      }

      // Step 2 — build rich embedding text (includes description)
      const embeddingText = buildEmbeddingText({ ...recipe, description });

      // Step 3 — generate and store vector
      const embedding = await generateEmbedding(embeddingText);
      if (!embedding) return;
      const vectorString = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE recipes SET embedding = $1::vector WHERE id = $2`,
        vectorString,
        recipe.id,
      );
      console.log(`[embeddings] embedding stored for recipe ${recipe.id}`);
    } catch (err) {
      console.error(`[embeddings] pipeline failed for recipe ${recipe.id}:`, err);
    }
  })();
}
