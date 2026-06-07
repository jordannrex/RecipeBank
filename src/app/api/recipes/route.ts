import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recipeCreateSchema } from "@/lib/recipe-schemas";
import { buildEmbeddingText, generateEmbedding, embedRecipeInBackground, searchRecipesByEmbedding } from "@/lib/embeddings";
import type { RecipeListItem, RecipeListResponse } from "@/types/recipe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function totalTimeMinutes(
  prep: number | null,
  cook: number | null,
): number | null {
  if (prep === null && cook === null) return null;
  return (prep ?? 0) + (cook ?? 0);
}

function toListItem(r: {
  id: string;
  title: string;
  photoUrl: string | null;
  cuisine: string | null;
  dishType: string | null;
  isFavorite: boolean;
  complexity: "EASY" | "MEDIUM" | "HARD";
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number;
  createdAt: Date;
}): RecipeListItem {
  return {
    ...r,
    totalTimeMinutes: totalTimeMinutes(r.prepTimeMinutes, r.cookTimeMinutes),
  };
}

const recipeListSelect = {
  id: true,
  title: true,
  photoUrl: true,
  cuisine: true,
  dishType: true,
  isFavorite: true,
  complexity: true,
  prepTimeMinutes: true,
  cookTimeMinutes: true,
  servings: true,
  createdAt: true,
} as const;

// ---------------------------------------------------------------------------
// GET /api/recipes — paginated list with filters
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  ai: z.coerce.boolean().optional(), // semantic search toggle
  favorites: z.coerce.boolean().optional(),
  cuisine: z.string().optional(),
  dishType: z.string().optional(),
  complexity: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
});

export async function GET(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }

  const { page, limit, q, ai, favorites, cuisine, dishType, complexity } = parsed.data;
  const skip = (page - 1) * limit;

  // ── AI semantic search ────────────────────────────────────────────────────
  // Only returns recipes above the similarity threshold. Falls through to
  // standard text search when the query has no confident semantic matches
  // (e.g. short ingredient keywords like "beef" that text search handles better).
  if (ai && q) {
    try {
      const queryEmbedding = await generateEmbedding(q, true);
      if (queryEmbedding) {
        const matches = await searchRecipesByEmbedding(auth.user.id, queryEmbedding, limit);
        if (matches.length > 0) {
          const ids = matches.map((m) => m.id);
          const rows = await prisma.recipe.findMany({
            where: { id: { in: ids }, userId: auth.user.id },
            select: recipeListSelect,
          });
          const rowMap = new Map(rows.map((r) => [r.id, r]));
          const ordered = ids.map((id) => rowMap.get(id)).filter(Boolean) as typeof rows;
          const data: RecipeListResponse = {
            recipes: ordered.map(toListItem),
            total: ordered.length,
            page: 1,
            limit,
          };
          return apiSuccess(data);
        }
        // No confident semantic matches — fall through to text search below
      }
    } catch (err) {
      console.error("[recipes] AI search failed, falling back to text search:", err);
    }
  }

  // ── Standard text search ──────────────────────────────────────────────────
  const where = {
    userId: auth.user.id,
    ...(q ? {
      OR: [
        { title:        { contains: q, mode: "insensitive" as const } },
        { description:  { contains: q, mode: "insensitive" as const } },
        { cuisine:      { contains: q, mode: "insensitive" as const } },
        { dishType:     { contains: q, mode: "insensitive" as const } },
        { flavorProfile:{ contains: q, mode: "insensitive" as const } },
        { ingredientGroups: { some: { ingredients: { some: { name: { contains: q, mode: "insensitive" as const } } } } } },
      ],
    } : {}),
    ...(favorites   ? { isFavorite: true } : {}),
    ...(cuisine     ? { cuisine:    { contains: cuisine,   mode: "insensitive" as const } } : {}),
    ...(dishType    ? { dishType:   { contains: dishType,  mode: "insensitive" as const } } : {}),
    ...(complexity  ? { complexity } : {}),
  };

  const [recipes, total] = await prisma.$transaction([
    prisma.recipe.findMany({
      where,
      select: recipeListSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.recipe.count({ where }),
  ]);

  const data: RecipeListResponse = {
    recipes: recipes.map(toListItem),
    total,
    page,
    limit,
  };

  return apiSuccess(data);
}

// ---------------------------------------------------------------------------
// POST /api/recipes — create a new recipe
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = recipeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const {
    title, description, photoUrl, sourceUrl, servings, prepTimeMinutes, cookTimeMinutes,
    complexity, dishType, cuisine, flavorProfile, ingredientGroups, steps,
  } = parsed.data;

  const recipe = await prisma.recipe.create({
    data: {
      userId: auth.user.id,
      title,
      description: description ?? null,
      photoUrl: photoUrl ?? null,
      sourceUrl: sourceUrl ?? null,
      servings,
      currentServings: servings,
      prepTimeMinutes: prepTimeMinutes ?? null,
      cookTimeMinutes: cookTimeMinutes ?? null,
      complexity,
      dishType: dishType ?? null,
      cuisine: cuisine ?? null,
      flavorProfile: flavorProfile ?? null,
      ingredientGroups: {
        create: ingredientGroups.map((group, gi) => ({
          name: group.name,
          sortOrder: group.sortOrder ?? gi,
          ingredients: {
            create: group.ingredients.map((ing, ii) => ({
              name: ing.name,
              quantity: ing.quantity ?? null,
              unit: ing.unit ?? null,
              preparation: ing.preparation ?? null,
              isOptional: ing.isOptional,
              sortOrder: ing.sortOrder ?? ii,
            })),
          },
        })),
      },
      steps: {
        create: steps.map((step, si) => ({
          body: step.body,
          sortOrder: step.sortOrder ?? si,
          sectionHeader: step.sectionHeader ?? null,
        })),
      },
    },
    include: {
      ingredientGroups: {
        include: { ingredients: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      steps: { orderBy: { sortOrder: "asc" } },
    },
  });

  // Generate description (if empty) + embedding in the background (non-blocking)
  embedRecipeInBackground({
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    dishType: recipe.dishType,
    flavorProfile: recipe.flavorProfile,
    ingredientGroups: recipe.ingredientGroups,
    steps: recipe.steps,
  });

  return apiSuccess(recipe, 201);
}
