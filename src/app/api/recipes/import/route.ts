import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { importRecipeFromUrl } from "@/lib/recipe-import";

const bodySchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

/**
 * POST /api/recipes/import
 * Body: { url: string }
 * Returns: extracted ImportedRecipe data (not saved — user reviews first)
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

  const result = await importRecipeFromUrl(parsed.data.url);

  if (!result.ok) {
    return apiError(result.error, 422);
  }

  return apiSuccess(result.recipe);
}
