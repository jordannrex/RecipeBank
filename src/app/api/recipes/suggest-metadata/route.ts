import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  ingredients: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]),
});

export type MetadataSuggestion = {
  cuisine: string | null;
  dishType: string | null;
  complexity: "EASY" | "MEDIUM" | "HARD" | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  flavorProfile: string | null;
  description: string | null;
};

/**
 * POST /api/recipes/suggest-metadata
 * Uses Gemini (gemini-2.5-flash) to infer metadata from a partial recipe.
 * Only called client-side when the user clicks "Suggest Metadata".
 */
export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { title, description, ingredients, steps } = parsed.data;

  const ingredientText = ingredients.filter(Boolean).slice(0, 30).join(", ");
  const stepText = steps.filter(Boolean).slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join("\n");

  const prompt = `You are a culinary expert. Given the recipe below, use your knowledge of this dish to fill in the metadata fields. Match the recipe to similar dishes you know — use the title, ingredients, and steps together to determine the most accurate values.

Return ONLY a JSON object with exactly these fields (use null only if you truly cannot determine a value):
{
  "cuisine": "the national or regional cuisine this dish belongs to, e.g. Italian, Mexican, American, Thai, Japanese",
  "dishType": "the category of dish, e.g. Pasta, Soup, Salad, Burger, Stir Fry, Tacos, Dessert, Breakfast",
  "complexity": "EASY, MEDIUM, or HARD based on technique and number of steps",
  "prepTimeMinutes": estimated prep time as a whole number,
  "cookTimeMinutes": estimated cook time as a whole number,
  "flavorProfile": "2-4 comma-separated flavor descriptors, e.g. savory, rich, spicy, tangy, umami",
  "description": "an appetizing 2-3 sentence description of the dish: name the main ingredients, cooking technique, flavor, and when you'd serve it. Write naturally, as if describing it to someone deciding what to cook tonight."
}

Recipe title: ${title}
${description ? `Description: ${description}` : ""}
${ingredientText ? `Ingredients: ${ingredientText}` : ""}
${stepText ? `Steps:\n${stepText}` : ""}`;

  try {
    const model = getGemini().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        // @ts-expect-error — thinkingConfig is valid for gemini-2.5-flash but not yet in SDK types
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const result = await model.generateContent(prompt);
    const json = JSON.parse(result.response.text()) as MetadataSuggestion;

    return apiSuccess(json);
  } catch (err) {
    // Surface the real cause in server logs so it's easy to diagnose
    const message = err instanceof Error ? err.message : String(err);
    console.error("[suggest-metadata] failed:", message);

    // Pass a specific hint to the client when the key is the problem
    if (message.includes("API_KEY_INVALID") || message.includes("API key not valid") || message.includes("PERMISSION_DENIED")) {
      return apiError("Gemini API key is missing or invalid — check GEMINI_API_KEY in .env.local.", 502);
    }
    return apiError("Could not generate suggestions — try again.", 502);
  }
}
