import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// PATCH /api/ingredients/[id]/price
//
// Persists the last-known store package size + price for a single ingredient.
// Both the shopping list price calculator and the recipe price calculator write
// here, so data stays in sync everywhere the ingredient appears.
//
// Ownership is verified via: ingredient → ingredientGroup → recipe → userId.
// ---------------------------------------------------------------------------

const priceSchema = z.object({
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

  // Verify ownership
  const ingredient = await prisma.ingredient.findUnique({
    where: { id },
    select: {
      ingredientGroup: {
        select: { recipe: { select: { userId: true } } },
      },
    },
  });

  if (!ingredient) return apiError("Not found", 404);
  if (ingredient.ingredientGroup.recipe.userId !== auth.user.id) {
    return apiError("Forbidden", 403);
  }

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = priceSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const updated = await prisma.ingredient.update({
    where: { id },
    data: {
      storePkgQty:  parsed.data.storePkgQty,
      storePkgUnit: parsed.data.storePkgUnit,
      price:        parsed.data.price,
    },
    select: { storePkgQty: true, storePkgUnit: true, price: true },
  });

  return apiSuccess({
    storePkgQty:  updated.storePkgQty  ? Number(updated.storePkgQty)  : null,
    storePkgUnit: updated.storePkgUnit ?? null,
    price:        updated.price        ? Number(updated.price)        : null,
  });
}
