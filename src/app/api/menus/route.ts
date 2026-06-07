import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MenuDetail, MenuSummary } from "@/types/menu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computeCost(/* no price data available in this schema */) {
  return { totalCost: null, isPartialCost: false };
}

function toMenuSummary(menu: {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
  items: Array<{ servings: number; recipe: { photoUrl: string | null } }>;
}): MenuSummary {
  const { totalCost, isPartialCost } = computeCost();
  return {
    id: menu.id,
    title: menu.title,
    description: menu.description,
    startDate: menu.startDate ? toDateStr(menu.startDate) : null,
    endDate: menu.endDate ? toDateStr(menu.endDate) : null,
    totalServings: menu.items.reduce((sum, it) => sum + it.servings, 0),
    totalCost,
    isPartialCost,
    itemCount: menu.items.length,
    recipePhotoUrls: menu.items.map((it) => it.recipe.photoUrl),
    updatedAt: menu.updatedAt.toISOString(),
  };
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

function toMenuDetail(menu: {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
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
}): MenuDetail {
  const summary = toMenuSummary(menu);
  return {
    ...summary,
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

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createMenuSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  items: z.array(z.object({
    recipeId: z.string().min(1),
    servings: z.number().int().min(1).optional(),
    cookDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).max(10).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/menus
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const menus = await prisma.menu.findMany({
    where: { userId: auth.user.id },
    include: menuInclude,
    orderBy: { updatedAt: "desc" },
  });

  const summaries: MenuSummary[] = menus.map(toMenuSummary);
  return apiSuccess(summaries);
}

// ---------------------------------------------------------------------------
// POST /api/menus
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = createMenuSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { title, description, startDate, endDate, items } = parsed.data;

  // Validate date range
  if (startDate && endDate && endDate < startDate) {
    return apiError("End date must be on or after start date", 400);
  }

  // Validate item count
  if (items && items.length > 10) {
    return apiError("A menu can have at most 10 recipes", 400);
  }

  // Verify recipe ownership for all items
  const recipeIds = (items ?? []).map((it) => it.recipeId);
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: recipeIds }, userId: auth.user.id },
    select: { id: true, currentServings: true },
  });

  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  for (const recipeId of recipeIds) {
    if (!recipeMap.has(recipeId)) return apiError(`Recipe ${recipeId} not found`, 404);
  }

  const menu = await prisma.menu.create({
    data: {
      userId: auth.user.id,
      title,
      description: description ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      items: items && items.length > 0 ? {
        create: items.map((item, idx) => ({
          recipeId: item.recipeId,
          servings: item.servings ?? recipeMap.get(item.recipeId)!.currentServings,
          cookDate: item.cookDate ? new Date(item.cookDate) : null,
          sortOrder: idx,
        })),
      } : undefined,
    },
    include: menuInclude,
  });

  return apiSuccess(toMenuDetail(menu), 201);
}
