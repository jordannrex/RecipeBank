import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMenuCost, formatCost, type CostIngredient } from "@/lib/cost";
import type { MenuDetail, MenuUsageRecord } from "@/types/menu";

// ---------------------------------------------------------------------------
// Helpers (duplicated from route.ts for self-containment)
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toUsageRecord(u: {
  id: string; startDate: Date; endDate: Date | null;
  type: string; notes: string | null; createdAt: Date;
}): MenuUsageRecord {
  return {
    id: u.id,
    startDate: toDateStr(u.startDate),
    endDate: u.endDate ? toDateStr(u.endDate) : null,
    type: u.type as "planned" | "logged",
    notes: u.notes,
    createdAt: u.createdAt.toISOString(),
  };
}

function computeUsageFields(usages: MenuUsageRecord[]) {
  const today = localToday();
  const currentUsage = usages.find(
    (u) => u.startDate <= today && (u.endDate === null || u.endDate >= today),
  ) ?? null;
  const nextPlannedUsage = usages
    .filter((u) => u.type === "planned" && u.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const usageCount = usages.filter((u) => u.type === "logged").length;
  return { currentUsage, nextPlannedUsage, usageCount };
}

const menuInclude = {
  items: {
    include: {
      recipe: {
        select: {
          id: true, title: true, photoUrl: true,
          currentServings: true, cuisine: true, dishType: true,
          servings: true,
          ingredientGroups: {
            select: {
              ingredients: {
                select: {
                  quantity: true, unit: true,
                  storePkgQty: true, storePkgUnit: true, price: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  usages: {
    orderBy: { startDate: "asc" as const },
  },
};

type MenuWithRelations = {
  id: string;
  title: string;
  description: string | null;
  updatedAt: Date;
  userId: string;
  items: Array<{
    id: string; sortOrder: number; servings: number;
    cookDate: Date | null; notes: string | null;
    recipe: {
      id: string; title: string; photoUrl: string | null;
      currentServings: number; cuisine: string | null; dishType: string | null;
      servings: number;
      ingredientGroups: Array<{ ingredients: CostIngredient[] }>;
    };
  }>;
  usages: Array<{
    id: string; startDate: Date; endDate: Date | null;
    type: string; notes: string | null; createdAt: Date;
  }>;
};

/** Per-item costs (aligned to menu.items order) plus the menu total + partial flag. */
function menuCostFields(menu: MenuWithRelations) {
  const { itemCosts, totalCost, isPartial } = computeMenuCost(
    menu.items.map((it) => ({
      servings: it.servings,
      recipe: {
        servings: it.recipe.servings,
        ingredientGroups: it.recipe.ingredientGroups,
      },
    })),
  );
  return {
    itemCosts,
    totalCost: totalCost !== null ? formatCost(totalCost) : null,
    isPartialCost: isPartial,
  };
}

function toMenuDetail(menu: MenuWithRelations): MenuDetail {
  const usageRecords = menu.usages.map(toUsageRecord);
  const { currentUsage, nextPlannedUsage, usageCount } = computeUsageFields(usageRecords);
  const { itemCosts, totalCost, isPartialCost } = menuCostFields(menu);
  return {
    id: menu.id,
    title: menu.title,
    description: menu.description,
    totalServings: menu.items.reduce((sum, it) => sum + it.servings, 0),
    totalCost,
    isPartialCost,
    itemCount: menu.items.length,
    recipePhotoUrls: menu.items.map((it) => it.recipe.photoUrl),
    usageCount,
    currentUsage,
    nextPlannedUsage,
    updatedAt: menu.updatedAt.toISOString(),
    items: menu.items.map((item, i) => ({
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
        estimatedCost: itemCosts[i] !== null ? formatCost(itemCosts[i]!) : null,
      },
    })),
    allUsages: usageRecords.sort((a, b) => b.startDate.localeCompare(a.startDate)),
  };
}

const patchMenuSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
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

  return apiSuccess(toMenuDetail(menu as MenuWithRelations));
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
  const menu = await prisma.menu.findUnique({ where: { id }, select: { userId: true } });
  if (!menu) return apiError("Menu not found", 404);
  if (menu.userId !== auth.user.id) return apiError("Forbidden", 403);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = patchMenuSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { title, description } = parsed.data;

  const updated = await prisma.menu.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
    },
    include: menuInclude,
  });

  // Return the full detail (items + allUsages) — the detail modal's save handler
  // rehydrates its item list from this response.
  return apiSuccess(toMenuDetail(updated as MenuWithRelations));
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
