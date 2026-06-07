import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function toDateStr(d: Date): string {
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const addItemSchema = z.object({
  recipeId: z.string().min(1),
  servings: z.number().int().min(1).optional(),
  cookDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/menus/[id]/items
// ---------------------------------------------------------------------------

export async function POST(
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

  if (menu.items.length >= 10) {
    return apiError("A menu can have at most 10 recipes", 400);
  }

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { recipeId, servings, cookDate } = parsed.data;

  // Verify recipe ownership
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true, currentServings: true, title: true, photoUrl: true, cuisine: true, dishType: true },
  });
  if (!recipe || recipe.userId !== auth.user.id) return apiError("Recipe not found", 404);

  // Validate cookDate within menu date range
  if (cookDate && menu.startDate && cookDate < toDateStr(menu.startDate)) {
    return apiError("Cook date must be within the menu date range", 400);
  }
  if (cookDate && menu.endDate && cookDate > toDateStr(menu.endDate)) {
    return apiError("Cook date must be within the menu date range", 400);
  }

  const nextOrder = menu.items.length;
  const item = await prisma.menuItem.create({
    data: {
      menuId,
      recipeId,
      servings: servings ?? recipe.currentServings,
      cookDate: cookDate ? new Date(cookDate) : null,
      sortOrder: nextOrder,
    },
    include: {
      recipe: {
        select: {
          id: true, title: true, photoUrl: true, currentServings: true, cuisine: true, dishType: true,
        },
      },
    },
  });

  return apiSuccess({
    id: item.id,
    sortOrder: item.sortOrder,
    servings: item.servings,
    cookDate: item.cookDate ? toDateStr(item.cookDate) : null,
    notes: item.notes,
    recipe: {
      id: item.recipe.id,
      title: item.recipe.title,
      photoUrl: item.recipe.photoUrl,
      currentServings: item.recipe.currentServings,
      cuisine: item.recipe.cuisine,
      dishType: item.recipe.dishType,
      estimatedCost: null,
    },
  }, 201);
}
