import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MealPlanUsageRecord } from "@/types/meal-plan";

function toDateStr(d: Date): string {
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUsageRecord(u: {
  id: string; startDate: Date; endDate: Date | null;
  type: string; notes: string | null; createdAt: Date;
}): MealPlanUsageRecord {
  return {
    id: u.id,
    startDate: toDateStr(u.startDate),
    endDate: u.endDate ? toDateStr(u.endDate) : null,
    type: u.type as "planned" | "logged",
    notes: u.notes,
    createdAt: u.createdAt.toISOString(),
  };
}

const createUsageSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  type: z.enum(["planned", "logged"]),
  notes: z.string().nullable().optional(),
});

// GET /api/meal-plans/[id]/usages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const mealPlan = await prisma.mealPlan.findUnique({ where: { id }, select: { userId: true } });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  const usages = await prisma.mealPlanUsage.findMany({
    where: { mealPlanId: id },
    orderBy: { startDate: "desc" },
  });

  return apiSuccess(usages.map(toUsageRecord));
}

// POST /api/meal-plans/[id]/usages
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (!auth) return apiError("Unauthorized", 401);

  const { id } = await params;
  const mealPlan = await prisma.mealPlan.findUnique({ where: { id }, select: { userId: true } });
  if (!mealPlan) return apiError("MealPlan not found", 404);
  if (mealPlan.userId !== auth.user.id) return apiError("Forbidden", 403);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid body", 400); }

  const parsed = createUsageSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { startDate, endDate, type, notes } = parsed.data;
  if (endDate && endDate < startDate) return apiError("End date must be on or after start date", 400);

  const usage = await prisma.mealPlanUsage.create({
    data: {
      mealPlanId: id,
      userId: auth.user.id,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      type,
      notes: notes ?? null,
    },
  });

  return apiSuccess(toUsageRecord(usage), 201);
}
