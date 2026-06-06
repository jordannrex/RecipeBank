import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedRecipe } from "@/lib/recipe-helpers";

const cookLogSchema = z.object({
  /** ISO date string (YYYY-MM-DD). Defaults to today when omitted. */
  cookedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "cookedAt must be a date in YYYY-MM-DD format")
    .optional(),
  notes: z.string().max(5_000).nullable().optional(),
});

/**
 * GET /api/recipes/[id]/cook-log
 * Returns all cook log entries for a recipe, newest first.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  const entries = await prisma.cookLog.findMany({
    where: { recipeId: id, userId: auth.user.id },
    orderBy: { cookedAt: "desc" },
  });

  return apiSuccess(entries);
}

/**
 * POST /api/recipes/[id]/cook-log
 * Records a cook session. Also increments recipe.cookCount and updates
 * recipe.lastCookedAt if this session is the most recent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = cookLogSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const cookedAt = parsed.data.cookedAt
    ? new Date(parsed.data.cookedAt)
    : new Date();

  const entry = await prisma.$transaction(async (tx) => {
    const log = await tx.cookLog.create({
      data: {
        recipeId: id,
        userId: auth.user.id,
        cookedAt,
        notes: parsed.data.notes ?? null,
      },
    });

    // Keep cookCount and lastCookedAt in sync.
    // lastCookedAt reflects the most recent cookedAt across all log entries.
    const mostRecent = await tx.cookLog.findFirst({
      where: { recipeId: id, userId: auth.user.id },
      orderBy: { cookedAt: "desc" },
      select: { cookedAt: true },
    });

    await tx.recipe.update({
      where: { id },
      data: {
        cookCount: { increment: 1 },
        lastCookedAt: mostRecent?.cookedAt ?? cookedAt,
      },
    });

    return log;
  });

  return apiSuccess(entry, 201);
}
