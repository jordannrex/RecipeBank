import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/shopping/items?recipeId=X
// Returns shopping items for a specific recipe (used by recipe detail tab).
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
        // Include name + isChecked so the recipe page can match by name/id
        // and also reflect the checked state (checked = "Have It" on recipe page).
        select: { id: true, ingredientId: true, name: true, isChecked: true },
      },
    },
  });

  const items = lists.flatMap((l) => l.items);

  return apiSuccess({ items });
}

// ---------------------------------------------------------------------------
// POST /api/shopping/items
// Adds an item to the shopping list.
//
// Two modes:
//   • Recipe item  — links to a recipe ingredient (deduplicates by ingredientId)
//   • Manual item  — free-text entry, stored under the user's manual list
// ---------------------------------------------------------------------------

const recipeItemSchema = z.object({
  isManual: z.literal(false).optional(),
  recipeId: z.string(),
  recipeName: z.string(),
  ingredientId: z.string(),
  name: z.string().min(1),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

const manualItemSchema = z.object({
  isManual: z.literal(true),
  name: z.string().min(1),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

const addItemSchema = z.union([recipeItemSchema, manualItemSchema]);

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

  const data = parsed.data;

  // ── Manual item ────────────────────────────────────────────────────────────
  if (data.isManual) {
    // Find or create the user's manual list (recipeId: null)
    let list = await prisma.shoppingList.findFirst({
      where: { userId: auth.user.id, recipeId: null },
      select: { id: true },
    });
    if (!list) {
      list = await prisma.shoppingList.create({
        data: { userId: auth.user.id },
        select: { id: true },
      });
    }

    const item = await prisma.shoppingItem.create({
      data: {
        shoppingListId: list.id,
        name: data.name,
        quantity: data.quantity ?? null,
        unit: data.unit ?? null,
        isManual: true,
      },
      select: { id: true },
    });

    return apiSuccess({ id: item.id }, 201);
  }

  // ── Recipe-linked item ─────────────────────────────────────────────────────
  const { recipeId, recipeName, ingredientId, name, quantity, unit } = data;

  // Verify recipe ownership
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true },
  });
  if (!recipe || recipe.userId !== auth.user.id) {
    return apiError("Recipe not found", 404);
  }

  // Find or create the ShoppingList for this user + recipe — atomically.
  // upsert on the @@unique([userId, recipeId]) constraint makes concurrent adds
  // (addAllToList / drawer fire N POSTs in parallel) converge on ONE list
  // instead of racing to create duplicates.
  const list = await prisma.shoppingList.upsert({
    where: { userId_recipeId: { userId: auth.user.id, recipeId } },
    update: { name: recipeName },   // keep the list label current if the recipe was renamed
    create: { userId: auth.user.id, recipeId, name: recipeName },
    select: { id: true },
  });

  // Deduplicate by ingredientId OR name (name covers items whose ingredientId
  // was nulled by a prior recipe edit, so we don't add a second copy).
  const existing = await prisma.shoppingItem.findFirst({
    where: { shoppingListId: list.id, OR: [{ ingredientId }, { name }] },
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

  return apiSuccess({ id: item.id }, 201);
}
