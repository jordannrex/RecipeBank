import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
