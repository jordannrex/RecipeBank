import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/shopping/items/[id]
//
// Two modes (discriminated by body shape):
//   • { toggle: true }                        — flip isChecked
//   • { storePkgQty, storePkgUnit, price }    — save price data for manual items
//     (Recipe-linked items save price via PATCH /api/ingredients/[id]/price instead)
// ---------------------------------------------------------------------------

const priceUpdateSchema = z.object({
  storePkgQty:  z.number().nullable(),
  storePkgUnit: z.string().nullable(),
  price:        z.number().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;

  const item = await prisma.shoppingItem.findUnique({
    where: { id },
    select: { isChecked: true, isManual: true, ingredientId: true, shoppingList: { select: { userId: true } } },
  });

  if (!item || item.shoppingList.userId !== auth.user.id) {
    return apiError("Not found", 404);
  }

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }

  // Price update for manual items (no ingredientId)
  const priceResult = priceUpdateSchema.safeParse(body);
  if (priceResult.success) {
    const { storePkgQty, storePkgUnit, price } = priceResult.data;
    const updated = await prisma.shoppingItem.update({
      where: { id },
      data: { storeQuantity: storePkgQty, storeUnit: storePkgUnit, price },
      select: { storeQuantity: true, storeUnit: true, price: true },
    });
    return apiSuccess({
      storePkgQty:  updated.storeQuantity ? Number(updated.storeQuantity) : null,
      storePkgUnit: updated.storeUnit ?? null,
      price:        updated.price ? Number(updated.price) : null,
    });
  }

  // Default: toggle isChecked
  const updated = await prisma.shoppingItem.update({
    where: { id },
    data: { isChecked: !item.isChecked },
    select: { isChecked: true },
  });

  return apiSuccess({ isChecked: updated.isChecked });
}

// ---------------------------------------------------------------------------
// DELETE /api/shopping/items/[id]
// Removes a shopping item. Verifies ownership via the parent ShoppingList.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;

  const item = await prisma.shoppingItem.findUnique({
    where: { id },
    select: {
      shoppingList: { select: { userId: true } },
    },
  });

  if (!item || item.shoppingList.userId !== auth.user.id) {
    return apiError("Not found", 404);
  }

  await prisma.shoppingItem.delete({ where: { id } });

  return apiSuccess({ deleted: true });
}
