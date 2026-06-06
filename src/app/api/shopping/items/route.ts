import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/shopping/items?recipeId=X
// Returns all shopping items for a given recipe owned by the current user.
// Response: { items: [{ id, ingredientId }] }
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const recipeId = searchParams.get("recipeId");
  if (!recipeId) return apiError("recipeId is required", 400);

  const lists = await prisma.shoppingList.findMany({
    where: { userId: auth.user.id, recipeId },
    select: {
      items: {
        select: { id: true, ingredientId: true },
      },
    },
  });

  const items = lists
    .flatMap((l) => l.items)
    .filter((i) => i.ingredientId !== null) as { id: string; ingredientId: string }[];

  return apiSuccess({ items });
}

// ---------------------------------------------------------------------------
// POST /api/shopping/items
// Adds an ingredient to the shopping list for a recipe.
// Body: { recipeId, recipeName, ingredientId, name, quantity?, unit? }
// Response: { id } — the new ShoppingItem id
// ---------------------------------------------------------------------------

const addItemSchema = z.object({
  recipeId: z.string(),
  recipeName: z.string(),
  ingredientId: z.string(),
  name: z.string().min(1),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { recipeId, recipeName, ingredientId, name, quantity, unit } = parsed.data;

  // Verify the recipe belongs to the current user
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true },
  });
  if (!recipe || recipe.userId !== auth.user.id) {
    return apiError("Recipe not found", 404);
  }

  // Find or create a ShoppingList for this user + recipe
  let list = await prisma.shoppingList.findFirst({
    where: { userId: auth.user.id, recipeId },
    select: { id: true },
  });

  if (!list) {
    list = await prisma.shoppingList.create({
      data: {
        userId: auth.user.id,
        recipeId,
        name: recipeName,
      },
      select: { id: true },
    });
  }

  // Avoid duplicate entries for the same ingredient
  const existing = await prisma.shoppingItem.findFirst({
    where: { shoppingListId: list.id, ingredientId },
    select: { id: true },
  });
  if (existing) {
    return apiSuccess({ id: existing.id });
  }

  const item = await prisma.shoppingItem.create({
    data: {
      shoppingListId: list.id,
      ingredientId,
      recipeId,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
    },
    select: { id: true },
  });

  return apiSuccess({ id: item.id });
}
