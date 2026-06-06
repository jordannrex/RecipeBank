import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedRecipe } from "@/app/api/recipes/[id]/route";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(), // cuid of the last seen edit — for cursor pagination
});

/**
 * GET /api/recipes/[id]/edits
 * Returns the edit history for a recipe, newest first.
 * Supports cursor-based pagination via ?cursor=<lastEditId>.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const { error } = await getOwnedRecipe(id, auth.user.id);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }

  const { limit, cursor } = parsed.data;

  const edits = await prisma.recipeEdit.findMany({
    where: { recipeId: id },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // fetch one extra to determine if there's a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = edits.length > limit;
  const page = hasMore ? edits.slice(0, limit) : edits;
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;

  return apiSuccess({ edits: page, nextCursor, hasMore });
}
