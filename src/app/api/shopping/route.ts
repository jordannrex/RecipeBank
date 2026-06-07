import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ShoppingItemRow } from "@/types/shopping";

// ---------------------------------------------------------------------------
// GET /api/shopping
// Returns every shopping item for the current user, across all lists.
// Items include the denormalized `recipeName` from their parent ShoppingList.
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const lists = await prisma.shoppingList.findMany({
    where: { userId: auth.user.id },
    include: {
      items: {
        orderBy: { name: "asc" },
        include: {
          // Pull persisted price data from the linked Ingredient (if any)
          ingredient: { select: { storePkgQty: true, storePkgUnit: true, price: true } },
        },
      },
    },
  });

  const items: ShoppingItemRow[] = lists.flatMap((list) =>
    list.items.map((item) => ({
      id: item.id,
      shoppingListId: item.shoppingListId,
      ingredientId: item.ingredientId,
      recipeId: item.recipeId,
      name: item.name,
      quantity: item.quantity ? Number(item.quantity) : null,
      unit: item.unit,
      isChecked: item.isChecked,
      isManual: item.isManual,
      recipeName: list.name ?? null,
      // Price data: prefer Ingredient (shared), fall back to ShoppingItem fields (manual items)
      storePkgQty: item.ingredient?.storePkgQty
        ? Number(item.ingredient.storePkgQty)
        : item.storeQuantity ? Number(item.storeQuantity) : null,
      storePkgUnit: item.ingredient?.storePkgUnit ?? item.storeUnit ?? null,
      price: item.ingredient?.price
        ? Number(item.ingredient.price)
        : item.price ? Number(item.price) : null,
    })),
  );

  return apiSuccess({ items });
}

// ---------------------------------------------------------------------------
// DELETE /api/shopping
// Deletes ALL shopping items for the current user and cleans up empty lists.
// ---------------------------------------------------------------------------

export async function DELETE() {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  // Delete all items that belong to this user's lists
  await prisma.shoppingItem.deleteMany({
    where: { shoppingList: { userId: auth.user.id } },
  });

  // Clean up now-empty lists
  await prisma.shoppingList.deleteMany({
    where: { userId: auth.user.id },
  });

  return apiSuccess({ deleted: true });
}
