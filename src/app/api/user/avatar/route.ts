import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { toAuthUser } from "@/lib/auth/user";
import { prisma } from "@/lib/db";
import type { AvatarConfig } from "@/types/auth";

const avatarConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("initials"),
    letter: z.string().min(1).max(2),
    bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color"),
  }),
  z.object({
    type: z.literal("photo"),
    url: z.string().refine(
      (v) => v.startsWith("data:image/") || /^https?:\/\/.+/.test(v),
      "Must be a valid URL or uploaded image",
    ),
  }),
]);

/**
 * PATCH /api/user/avatar
 * Sets the active avatar and pushes the old one onto the history stack (max 5).
 */
export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = z.object({ config: avatarConfigSchema }).safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { config } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { avatarConfig: true, avatarHistory: true },
  });

  const currentConfig = (existing?.avatarConfig as AvatarConfig | null) ?? null;
  const currentHistory = (existing?.avatarHistory as AvatarConfig[] | null) ?? [];

  // Push current config into history, deduplicate against the incoming config, cap at 5.
  let newHistory = currentHistory;
  if (currentConfig) {
    const incomingKey = JSON.stringify(config);
    const filtered = currentHistory.filter((h) => JSON.stringify(h) !== incomingKey);
    const isDuplicate = JSON.stringify(currentConfig) === incomingKey;
    newHistory = isDuplicate ? filtered : [currentConfig, ...filtered].slice(0, 5);
  }

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      avatarConfig: config,
      avatarHistory: newHistory,
      avatarUrl: config.type === "photo" ? config.url : null,
    },
  });

  return apiSuccess(toAuthUser(updated));
}
