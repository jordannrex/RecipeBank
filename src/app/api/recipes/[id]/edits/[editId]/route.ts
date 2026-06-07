import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedRecipe } from "@/lib/recipe-helpers";

/**
 * DELETE /api/recipes/[id]/edits/[editId]
 * Permanently removes a single edit-history entry.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; editId: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id, editId } = await params;

  // Confirm the recipe belongs to the current user before touching its edits.
  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  const edit = await prisma.recipeEdit.findUnique({ where: { id: editId } });
  if (!edit || edit.recipeId !== id) return apiError("Edit not found", 404);

  await prisma.recipeEdit.delete({ where: { id: editId } });
  return apiSuccess({ deleted: true });
}
