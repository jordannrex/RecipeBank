import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedRecipe } from "@/app/api/recipes/[id]/route";

const noteSchema = z.object({
  body: z.string().min(1, "Note cannot be empty").max(10_000, "Note is too long"),
});

/**
 * GET /api/recipes/[id]/notes
 * Returns all notes for a recipe, newest first.
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

  const notes = await prisma.recipeNote.findMany({
    where: { recipeId: id, userId: auth.user.id },
    orderBy: { createdAt: "desc" },
  });

  return apiSuccess(notes);
}

/**
 * POST /api/recipes/[id]/notes
 * Creates a new note on a recipe.
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

  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const note = await prisma.recipeNote.create({
    data: {
      recipeId: id,
      userId: auth.user.id,
      body: parsed.data.body,
    },
  });

  return apiSuccess(note, 201);
}
