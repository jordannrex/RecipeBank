import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ingredientGroupSchema, stepSchema } from "@/app/api/recipes/route";

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

async function getOwnedRecipe(id: string, userId: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id } });
  if (!recipe) return { recipe: null, error: apiError("Recipe not found", 404) };
  if (recipe.userId !== userId) return { recipe: null, error: apiError("Forbidden", 403) };
  return { recipe, error: null };
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
  const { error } = await getOwnedRecipe(id, auth.user.id);
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

  const {
    ingredientGroups: newGroups,
    steps: newSteps,
    ...coreFields
  } = parsed.data;

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
