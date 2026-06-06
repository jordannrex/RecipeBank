import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedRecipe } from "@/lib/recipe-helpers";

/**
 * DELETE /api/recipes/[id]/notes/[noteId]
 * Deletes a note. The note must belong to both this recipe and this user.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id, noteId } = await params;

  // Verify the recipe is owned by this user first.
  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  // Find the note and confirm it belongs to this user + recipe.
  const note = await prisma.recipeNote.findUnique({ where: { id: noteId } });
  if (!note || note.recipeId !== id) return apiError("Note not found", 404);
  if (note.userId !== auth.user.id) return apiError("Forbidden", 403);

  await prisma.recipeNote.delete({ where: { id: noteId } });

  return apiSuccess({ ok: true });
}
