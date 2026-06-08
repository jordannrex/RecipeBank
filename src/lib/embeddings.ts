import { TaskType } from "@google/generative-ai";
import { prisma } from "@/lib/db";
import { getGemini } from "@/lib/gemini";

// ---------------------------------------------------------------------------
// AI enrichment generation (description + hidden search keywords)
// ---------------------------------------------------------------------------

export type RecipeEnrichment = {
  /** A 2–3 sentence natural-language description. Used as the recipe's
   *  description only when the user hasn't written one. */
  description: string | null;
  /** A dense, comma-separated bag of hidden search descriptors. Never stored
   *  or shown — folded into the embedding text so abstract queries match. */
  keywords: string | null;
};

/**
 * Asks Gemini, in a single call, to produce two things for the search index:
 *
 *   1. description — an appetizing 2–3 sentence blurb (main ingredients,
 *      technique, flavor, cuisine, occasion). Embedding-quality and also nice
 *      to surface when the user hasn't written their own.
 *   2. keywords — a dense bag of categorical descriptors a person might search
 *      for even when the words don't appear in the recipe (dietary, flavor,
 *      texture, meal type, cooking method, occasion, protein category). This is
 *      the enrichment that lets queries like "spicy", "seafood", or
 *      "vegetarian" retrieve well. It is never persisted or shown — it only
 *      enriches the embedding vector.
 *
 * Returns nulls on failure so callers can skip gracefully.
 */
export async function generateRecipeEnrichment(recipe: {
  title: string;
  cuisine?: string | null;
  dishType?: string | null;
  flavorProfile?: string | null;
  ingredientGroups?: Array<{ ingredients: Array<{ name: string; quantity?: string | Decimal | null; unit?: string | null }> }>;
  steps?: Array<{ body: string }>;
}): Promise<RecipeEnrichment> {
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

  const prompt = `You are indexing a recipe for a cooking app's semantic search. Based on the recipe below, return JSON with exactly two fields:

{
  "description": "An appetizing 2–3 sentence description: name the main protein or key ingredients, the cooking technique, the flavor profile, the cuisine style, and when someone would serve it. Write naturally, as if describing it to someone deciding what to cook tonight.",
  "keywords": "A dense, comma-separated list of search descriptors a person might use to find this dish — even words that do NOT appear in the recipe. Cover, where genuinely applicable: dietary categories (vegetarian, vegan, gluten-free, dairy-free, pescatarian), flavor (spicy, sweet, savory, sour, smoky, umami, tangy), texture (crispy, creamy, crunchy, tender), meal type (breakfast, lunch, dinner, snack, dessert, appetizer, side), cooking method (grilled, baked, fried, roasted, sauteed, raw, slow-cooked), occasion/season (weeknight, comfort food, summer, holiday), and the protein/ingredient category (seafood, poultry, beef, pork, plant-based). Be generous but accurate — never claim a dietary category that isn't true."
}

${lines}

Return ONLY the JSON object — no extra commentary.`;

  try {
    const model = getGemini().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        // @ts-expect-error — thinkingConfig valid for gemini-2.5-flash, not yet in SDK types
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text()) as Partial<RecipeEnrichment>;
    return {
      description: typeof parsed.description === "string" ? parsed.description.trim() || null : null,
      keywords: typeof parsed.keywords === "string" ? parsed.keywords.trim() || null : null,
    };
  } catch (err) {
    console.error("[embeddings] recipe enrichment generation failed:", err);
    return { description: null, keywords: null };
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
 *   1. Generate enrichment (AI description + hidden search keywords) in one
 *      Gemini call. This runs regardless of whether the user wrote their own
 *      description, so a terse user description never starves the embedding.
 *   2. If the recipe has no description, save the AI one to the DB (nice UX).
 *   3. Build the embedding text from the visible fields PLUS the hidden
 *      keyword bag — so abstract queries ("spicy", "seafood", "vegetarian")
 *      retrieve well. The keywords are never persisted or shown.
 *   4. Generate and store the embedding vector.
 *
 * All failures are logged and swallowed so callers are never affected.
 */
export function embedRecipeInBackground(recipe: RecipeForEmbed): void {
  (async () => {
    try {
      // Step 1 — enrichment (one call: description + hidden keywords)
      const enrichment = await generateRecipeEnrichment(recipe);

      // Step 2 — only fill in a description for the user if they left it blank
      let description = recipe.description ?? null;
      if (!description?.trim() && enrichment.description) {
        description = enrichment.description;
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { description: enrichment.description },
        });
        console.log(`[embeddings] AI description saved for recipe ${recipe.id}`);
      }

      // Step 3 — build rich embedding text (visible fields + hidden keywords)
      let embeddingText = buildEmbeddingText({ ...recipe, description });
      if (enrichment.keywords) embeddingText += ` ${enrichment.keywords}`;

      // Step 4 — generate and store vector
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
