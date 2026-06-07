import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MenuDetail } from "@/types/menu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const menuInclude = {
  items: {
    include: {
      recipe: {
        select: {
          id: true,
          title: true,
          photoUrl: true,
          currentServings: true,
          cuisine: true,
          dishType: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
};

type MenuWithItems = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
  userId: string;
  items: Array<{
    id: string;
    sortOrder: number;
    servings: number;
    cookDate: Date | null;
    notes: string | null;
    recipe: {
      id: string;
      title: string;
      photoUrl: string | null;
      currentServings: number;
      cuisine: string | null;
      dishType: string | null;
    };
  }>;
};

function toMenuDetail(menu: MenuWithItems): MenuDetail {
  return {
    id: menu.id,
    title: menu.title,
    description: menu.description,
    startDate: menu.startDate ? toDateStr(menu.startDate) : null,
    endDate: menu.endDate ? toDateStr(menu.endDate) : null,
    totalServings: menu.items.reduce((sum, it) => sum + it.servings, 0),
    totalCost: null,
    isPartialCost: false,
    itemCount: menu.items.length,
    recipePhotoUrls: menu.items.map((it) => it.recipe.photoUrl),
    updatedAt: menu.updatedAt.toISOString(),
    items: menu.items.map((item) => ({
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
    })),
  };
}

const patchMenuSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/menus/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const menu = await prisma.menu.findUnique({ where: { id }, include: menuInclude });
  if (!menu) return apiError("Menu not found", 404);
  if (menu.userId !== auth.user.id) return apiError("Forbidden", 403);

  return apiSuccess(toMenuDetail(menu as MenuWithItems));
}

// ---------------------------------------------------------------------------
// PATCH /api/menus/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const menu = await prisma.menu.findUnique({ where: { id }, select: { userId: true, startDate: true, endDate: true } });
  if (!menu) return apiError("Menu not found", 404);
  if (menu.userId !== auth.user.id) return apiError("Forbidden", 403);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = patchMenuSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { title, description, startDate, endDate } = parsed.data;

  // Resolve the effective start/end for validation
  // "undefined" means unchanged, "null" means clear
  const effectiveStart = startDate !== undefined ? startDate : (menu.startDate ? toDateStr(menu.startDate) : null);
  const effectiveEnd   = endDate   !== undefined ? endDate   : (menu.endDate   ? toDateStr(menu.endDate)   : null);

  if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
    return apiError("End date must be on or after start date", 400);
  }

  const updated = await prisma.menu.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
    include: menuInclude,
  });

  return apiSuccess(toMenuDetail(updated as MenuWithItems));
}

// ---------------------------------------------------------------------------
// DELETE /api/menus/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const menu = await prisma.menu.findUnique({ where: { id }, select: { userId: true } });
  if (!menu) return apiError("Menu not found", 404);
  if (menu.userId !== auth.user.id) return apiError("Forbidden", 403);

  await prisma.menu.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
