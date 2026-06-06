import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ingredientGroupSchema, stepSchema } from "@/app/api/recipes/route";
import type { Recipe } from "@prisma/client";

const recipeUpdateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500).optional(),
  description: z.string().nullable().optional(),
  servings: z.number().int().min(1).optional(),
  prepTimeMinutes: z.number().int().min(0).nullable().optional(),
  cookTimeMinutes: z.number().int().min(0).nullable().optional(),
  complexity: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  dishType: z.string().max(100).nullable().optional(),
  cuisine: z.string().max(100).nullable().optional(),
  flavorProfile: z.string().max(500).nullable().optional(),
  isFavorite: z.boolean().optional(),
  // When provided, replaces all existing groups + their ingredients.
  ingredientGroups: z.array(ingredientGroupSchema).optional(),
  // When provided, replaces all existing steps.
  steps: z.array(stepSchema).optional(),
});

const recipeInclude = {
  ingredientGroups: {
    include: { ingredients: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: { sortOrder: "asc" as const },
  },
  steps: { orderBy: { sortOrder: "asc" as const } },
} as const;

/**
 * Fetches a recipe and verifies ownership.
 * Returns { recipe, error: null } on success or { recipe: null, error: Response } on failure.
 * Exported so sub-routes (favorite, notes, cook-log, edits) can reuse it.
 */
export async function getOwnedRecipe(id: string, userId: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id } });
  if (!recipe) return { recipe: null, error: apiError("Recipe not found", 404) };
  if (recipe.userId !== userId) return { recipe: null, error: apiError("Forbidden", 403) };
  return { recipe, error: null };
}

// ---------------------------------------------------------------------------
// Helpers for edit tracking
// ---------------------------------------------------------------------------

/** Fields whose values we record in RecipeEdit when they change. */
const TRACKED_CORE_FIELDS = [
  "title", "description", "servings", "prepTimeMinutes", "cookTimeMinutes",
  "complexity", "dishType", "cuisine", "flavorProfile", "isFavorite",
] as const;

type TrackedField = typeof TRACKED_CORE_FIELDS[number];

function serialize(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function buildEditEntries(
  recipeId: string,
  userId: string,
  before: Recipe,
  patch: Partial<Record<TrackedField, unknown>>,
) {
  const entries: {
    recipeId: string;
    userId: string;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }[] = [];

  for (const field of TRACKED_CORE_FIELDS) {
    if (!(field in patch)) continue;
    const oldStr = serialize(before[field]);
    const newStr = serialize(patch[field]);
    if (oldStr !== newStr) {
      entries.push({ recipeId, userId, fieldName: field, oldValue: oldStr, newValue: newStr });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// GET /api/recipes/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { recipe, error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  const full = await prisma.recipe.findUnique({
    where: { id: recipe!.id },
    include: recipeInclude,
  });

  return apiSuccess(full);
}

// ---------------------------------------------------------------------------
// PATCH /api/recipes/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { recipe: currentRecipe, error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = recipeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { ingredientGroups: newGroups, steps: newSteps, ...coreFields } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    // Update core recipe fields
    if (Object.keys(coreFields).length > 0) {
      await tx.recipe.update({ where: { id }, data: coreFields });
    }

    // Replace ingredient groups (and their ingredients via cascade)
    if (newGroups !== undefined) {
      await tx.ingredientGroup.deleteMany({ where: { recipeId: id } });
      for (const [gi, group] of newGroups.entries()) {
        await tx.ingredientGroup.create({
          data: {
            recipeId: id,
            name: group.name,
            sortOrder: group.sortOrder ?? gi,
            ingredients: {
              create: group.ingredients.map((ing, ii) => ({
                name: ing.name,
                quantity: ing.quantity ?? null,
                unit: ing.unit ?? null,
                preparation: ing.preparation ?? null,
                isOptional: ing.isOptional,
                sortOrder: ing.sortOrder ?? ii,
              })),
            },
          },
        });
      }
    }

    // Replace steps
    if (newSteps !== undefined) {
      await tx.recipeStep.deleteMany({ where: { recipeId: id } });
      if (newSteps.length > 0) {
        await tx.recipeStep.createMany({
          data: newSteps.map((step, si) => ({
            recipeId: id,
            body: step.body,
            sortOrder: step.sortOrder ?? si,
            sectionHeader: step.sectionHeader ?? null,
          })),
        });
      }
    }

    // Record edit history
    const editEntries = buildEditEntries(
      id,
      auth.user.id,
      currentRecipe!,
      coreFields as Partial<Record<TrackedField, unknown>>,
    );

    if (newGroups !== undefined) {
      editEntries.push({
        recipeId: id,
        userId: auth.user.id,
        fieldName: "ingredientGroups",
        oldValue: null,
        newValue: null,
      });
    }

    if (newSteps !== undefined) {
      editEntries.push({
        recipeId: id,
        userId: auth.user.id,
        fieldName: "steps",
        oldValue: null,
        newValue: null,
      });
    }

    if (editEntries.length > 0) {
      await tx.recipeEdit.createMany({ data: editEntries });
    }

    return tx.recipe.findUnique({ where: { id }, include: recipeInclude });
  });

  return apiSuccess(updated);
}

// ---------------------------------------------------------------------------
// DELETE /api/recipes/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  await prisma.recipe.delete({ where: { id } });

  return apiSuccess({ ok: true });
}
