import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { toAuthUser } from "@/lib/auth/user";
import { prisma } from "@/lib/db";

const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(128, "Display name must be at most 128 characters")
    .optional(),
  avatarUrl: z.string().url("Must be a valid URL").nullable().optional(),
});

export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { displayName, avatarUrl } = parsed.data;

  if (displayName === undefined && avatarUrl === undefined) {
    return apiError("No fields to update", 400);
  }

  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      ...(displayName !== undefined && { displayName }),
      ...(avatarUrl !== undefined && { avatarUrl }),
    },
  });

  return apiSuccess(toAuthUser(user));
}
