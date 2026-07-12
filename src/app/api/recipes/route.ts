import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recipeCreateSchema } from "@/lib/recipe-schemas";
import { getRecipeCollection, collectionWhereOR } from "@/lib/recipe-collections";
import { generateEmbedding, embedRecipeInBackground, searchRecipesByEmbedding } from "@/lib/embeddings";
import { computeIngredientsCost } from "@/lib/cost";
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

type RecipeRow = {
  id: string;
  title: string;
  photoUrl: string | null;
  cuisine: string | null;
  dishType: string | null;
  isFavorite: boolean;
  complexity: "EASY" | "MEDIUM" | "HARD" | "NONE";
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number;
  createdAt: Date;
};

function toListItem(r: RecipeRow): RecipeListItem {
  // Pick fields explicitly so extra selected columns (e.g. cookCount /
  // ingredientGroups pulled in for the price sort) don't leak into the response.
  return {
    id: r.id,
    title: r.title,
    photoUrl: r.photoUrl,
    cuisine: r.cuisine,
    dishType: r.dishType,
    isFavorite: r.isFavorite,
    complexity: r.complexity,
    prepTimeMinutes: r.prepTimeMinutes,
    cookTimeMinutes: r.cookTimeMinutes,
    servings: r.servings,
    createdAt: r.createdAt,
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
  collection: z.string().optional(), // curated cuisine/dish-type row (see recipe-collections)
  complexity: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  sort: z
    .enum([
      "newest",
      "price_asc",
      "price_desc",
      "cooked_asc",
      "cooked_desc",
      "time_asc",
      "time_desc",
    ])
    .default("newest"),
});

export async function GET(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }

  const { page, limit, q, ai, favorites, cuisine, dishType, collection, complexity, sort } = parsed.data;
  const skip = (page - 1) * limit;

  // Curated collection → OR of case-insensitive substring matches on the
  // relevant field. Wrapped in AND so it composes with q/favorites/etc.
  const coll = collection ? getRecipeCollection(collection) : undefined;
  const collectionFilter = coll ? { AND: [{ OR: collectionWhereOR(coll) }] } : {};

  // ── AI semantic search ────────────────────────────────────────────────────
  // Only returns recipes above the similarity threshold. Falls through to
  // standard text search when the query has no confident semantic matches
  // (e.g. short ingredient keywords like "beef" that text search handles better).
  if (ai && q) {
    try {
      const queryEmbedding = await generateEmbedding(q, true);
      if (queryEmbedding) {
        // Pull a generous candidate set so that applying the active filters
        // below still leaves enough results to fill a page.
        const matches = await searchRecipesByEmbedding(
          auth.user.id,
          queryEmbedding,
          Math.max(limit * 3, 30),
        );
        if (matches.length > 0) {
          const ids = matches.map((m) => m.id);
          // Apply the same favorites/cuisine/dishType/complexity filters the
          // standard search uses, so AI search + filters behave consistently.
          const rows = await prisma.recipe.findMany({
            where: {
              id: { in: ids },
              userId: auth.user.id,
              ...(favorites  ? { isFavorite: true } : {}),
              ...(cuisine    ? { cuisine:  { contains: cuisine,  mode: "insensitive" as const } } : {}),
              ...(dishType   ? { dishType: { contains: dishType, mode: "insensitive" as const } } : {}),
              ...(complexity ? { complexity } : {}),
              ...collectionFilter,
            },
            select: recipeListSelect,
          });
          const rowMap = new Map(rows.map((r) => [r.id, r]));
          // Preserve similarity order, drop filtered-out rows, cap to the page size.
          const ordered = ids
            .map((id) => rowMap.get(id))
            .filter(Boolean)
            .slice(0, limit) as typeof rows;
          if (ordered.length > 0) {
            const data: RecipeListResponse = {
              recipes: ordered.map(toListItem),
              total: ordered.length,
              page: 1,
              limit,
            };
            return apiSuccess(data);
          }
          // Everything was filtered out — fall through to text search below.
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
    ...collectionFilter,
  };

  // ── Sort by price / times-cooked / total time ─────────────────────────────
  // Price is derived from per-ingredient pricing (not a stored column) and each
  // of these sorts has a "put recipes without data in normal order" rule, so
  // none maps cleanly to a SQL ORDER BY. We load all matching recipes, order +
  // partition in JS, then slice the requested page. `createdAt desc` is the
  // baseline order used for tie-breaks and for the "no data" group.
  if (sort !== "newest") {
    const ascending =
      sort === "price_asc" || sort === "cooked_asc" || sort === "time_asc";

    // Compute the sort key for each recipe. `key === null` means "no data" —
    // those keep their newest-first order and are appended after the sorted set.
    let keyed: { r: RecipeRow; key: number | null }[];
    if (sort === "price_asc" || sort === "price_desc") {
      const rows = await prisma.recipe.findMany({
        where,
        select: {
          ...recipeListSelect,
          ingredientGroups: {
            select: {
              ingredients: {
                select: {
                  quantity: true,
                  unit: true,
                  storePkgQty: true,
                  storePkgUnit: true,
                  price: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      keyed = rows.map((r) => ({
        r,
        // null when nothing on the recipe is priceable
        key: computeIngredientsCost(r.ingredientGroups.flatMap((g) => g.ingredients)).cost,
      }));
    } else if (sort === "cooked_asc" || sort === "cooked_desc") {
      const rows = await prisma.recipe.findMany({
        where,
        select: { ...recipeListSelect, cookCount: true },
        orderBy: { createdAt: "desc" },
      });
      keyed = rows.map((r) => ({
        r,
        key: r.cookCount > 0 ? r.cookCount : null, // 0 cooks = "no data"
      }));
    } else {
      // time_asc / time_desc — total time is prep + cook; null when neither is set.
      const rows = await prisma.recipe.findMany({
        where,
        select: recipeListSelect,
        orderBy: { createdAt: "desc" },
      });
      keyed = rows.map((r) => ({
        r,
        key: totalTimeMinutes(r.prepTimeMinutes, r.cookTimeMinutes),
      }));
    }

    // rows arrive in createdAt-desc order; Array.prototype.sort is stable, so
    // recipes with an equal key preserve that newest-first tie-break.
    const withData = keyed
      .filter((x) => x.key !== null)
      .sort((a, b) => (ascending ? a.key! - b.key! : b.key! - a.key!));
    const withoutData = keyed.filter((x) => x.key === null);

    const ordered = [...withData, ...withoutData].map((x) => x.r);
    const data: RecipeListResponse = {
      recipes: ordered.slice(skip, skip + limit).map(toListItem),
      total: ordered.length,
      page,
      limit,
    };
    return apiSuccess(data);
  }

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
