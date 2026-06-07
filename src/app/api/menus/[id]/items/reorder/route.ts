import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const reorderSchema = z.object({
  order: z.array(z.string().min(1)),
});

// ---------------------------------------------------------------------------
// PATCH /api/menus/[id]/items/reorder
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id: menuId } = await params;

  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
    include: { items: { select: { id: true } } },
  });
  if (!menu) return apiError("Menu not found", 404);
  if (menu.userId !== auth.user.id) return apiError("Forbidden", 403);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { order } = parsed.data;

  // Validate all ids belong to this menu
  const menuItemIds = new Set(menu.items.map((it) => it.id));
  for (const itemId of order) {
    if (!menuItemIds.has(itemId)) return apiError(`Item ${itemId} does not belong to this menu`, 400);
  }

  // Bulk update sort orders
  await Promise.all(
    order.map((itemId, idx) =>
      prisma.menuItem.update({
        where: { id: itemId },
        data: { sortOrder: idx },
      })
    )
  );

  return apiSuccess({ reordered: true });
}
