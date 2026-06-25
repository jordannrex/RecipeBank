/**
 * migrate-v1-to-user.ts
 *
 * One-shot migration: imports recipes from V1 Neon database into a specific V2 user.
 *
 * Usage:
 *   V1_DATABASE_URL="postgresql://..." npm run migrate:v1-user -- cmq4mmuwb000104la9cn6nzqd
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Complexity } from "@prisma/client";

type V1Ingredient = {
  group: string;
  name: string;
  quantity: string;
  unit: string;
};

type V1Step = {
  order: number;
  text: string;
};

type V1Recipe = {
  id: string;
  user_id: string | null;
  title: string;
  source_url: string | null;
  photo_url: string | null;
  is_favorite: boolean;
  ingredients: V1Ingredient[];
  steps: V1Step[];
  original_servings: number | null;
  current_servings: number | null;
  cuisine: string | null;
  dish_type: string | null;
  complexity: "easy" | "medium" | "hard" | null;
  prep_time_minutes: number | null;
  total_time_minutes: number | null;
  flavor_profiles: string[] | null;
  description: string | null;
  created_at: Date;
};

function parseFraction(s: string | null | undefined): number | null {
  if (!s || !s.trim()) return null;
  const t = s.trim();
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function mapComplexity(c: string | null): Complexity {
  switch (c) {
    case "easy": return Complexity.EASY;
    case "hard": return Complexity.HARD;
    default:     return Complexity.MEDIUM;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

async function main() {
  const v1Url = process.env.V1_DATABASE_URL;
  if (!v1Url) {
    console.error("✗ V1_DATABASE_URL is not set.");
    process.exit(1);
  }

  const v2Url = process.env.DATABASE_URL;
  if (!v2Url) {
    console.error("✗ DATABASE_URL is not set.");
    process.exit(1);
  }

  const v2UserId = process.argv[2];
  if (!v2UserId) {
    console.error("✗ V2 user ID required as argument: npm run migrate:v1-user -- <user-id>");
    process.exit(1);
  }

  console.log(`Migrating to V2 user: ${v2UserId}`);

  const v1Pool = new Pool({
    connectionString: v1Url,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const v2Pool = new Pool({ connectionString: v2Url, max: 5 });
  const adapter = new PrismaPg(v2Pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Find all V1 recipes
    const distinctResult = await v1Pool.query<{ user_id: string | null; count: string }>(
      "SELECT user_id, COUNT(*) as count FROM recipes GROUP BY user_id ORDER BY count DESC",
    );

    console.log("\nV1 recipe counts by user_id:");
    for (const row of distinctResult.rows) {
      console.log(`  ${row.user_id ?? "(null)"}: ${row.count} recipe(s)`);
    }

    let targetUserId: string | null = null;
    const specifiedUserId = process.env.V1_USER_ID ?? null;

    if (specifiedUserId) {
      targetUserId = specifiedUserId;
    } else if (distinctResult.rows.length === 1) {
      targetUserId = distinctResult.rows[0].user_id;
      console.log(`\n  → Single user found; migrating all recipes (user_id: ${targetUserId}).`);
    } else if (distinctResult.rows.length > 1) {
      console.error(
        "\n✗ Multiple user IDs found in V1. Set V1_USER_ID to specify:\n" +
        distinctResult.rows.map((r) => `  V1_USER_ID="${r.user_id}"`).join("\n"),
      );
      process.exit(1);
    } else {
      console.error("✗ No recipes found in V1 database.");
      process.exit(1);
    }

    const recipesQuery =
      targetUserId
        ? "SELECT * FROM recipes WHERE user_id = $1 ORDER BY created_at ASC"
        : "SELECT * FROM recipes ORDER BY created_at ASC";
    const recipesParams = targetUserId ? [targetUserId] : [];

    const recipesResult = await v1Pool.query<V1Recipe>(recipesQuery, recipesParams);
    const v1Recipes = recipesResult.rows;
    console.log(`\nFound ${v1Recipes.length} recipe(s) to migrate.`);

    // Get existing titles in V2 for dedup
    const existing = await prisma.recipe.findMany({
      where:  { userId: v2UserId },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map((r) => r.title.toLowerCase().trim()));

    let created = 0;
    let skipped = 0;

    for (const v1 of v1Recipes) {
      const titleKey = v1.title.toLowerCase().trim();

      if (existingTitles.has(titleKey)) {
        console.log(`  SKIP  "${v1.title}" — already exists`);
        skipped++;
        continue;
      }

      let cookTimeMinutes: number | null = null;
      if (v1.total_time_minutes != null) {
        const prep = v1.prep_time_minutes ?? 0;
        cookTimeMinutes = Math.max(0, v1.total_time_minutes - prep);
      }

      const flavorProfile =
        Array.isArray(v1.flavor_profiles) && v1.flavor_profiles.length > 0
          ? v1.flavor_profiles.join(", ")
          : null;

      const ingredients: V1Ingredient[] = Array.isArray(v1.ingredients)
        ? (v1.ingredients as V1Ingredient[])
        : [];

      const groupedIngredients = groupBy(ingredients, (i) => i.group ?? "");

      const steps: V1Step[] = Array.isArray(v1.steps)
        ? (v1.steps as V1Step[]).sort((a, b) => a.order - b.order)
        : [];

      await prisma.$transaction(async (tx) => {
        const recipe = await tx.recipe.create({
          data: {
            userId: v2UserId,
            title: v1.title,
            description: v1.description ?? null,
            sourceUrl: v1.source_url ?? null,
            photoUrl: v1.photo_url ?? null,
            isFavorite: v1.is_favorite,
            servings: v1.original_servings ?? 2,
            currentServings: v1.current_servings ?? v1.original_servings ?? 2,
            cuisine: v1.cuisine ?? null,
            dishType: v1.dish_type ?? null,
            complexity: mapComplexity(v1.complexity),
            prepTimeMinutes: v1.prep_time_minutes ?? null,
            cookTimeMinutes,
            flavorProfile,
          },
        });

        let groupIndex = 0;
        for (const [groupName, groupIngredients] of groupedIngredients) {
          const group = await tx.ingredientGroup.create({
            data: {
              recipeId: recipe.id,
              name: groupName,
              sortOrder: groupIndex++,
            },
          });

          await tx.ingredient.createMany({
            data: groupIngredients.map((ing, ii) => ({
              ingredientGroupId: group.id,
              name: ing.name.trim(),
              quantity: parseFraction(ing.quantity),
              unit: ing.unit?.trim() || null,
              preparation: null,
              isOptional: false,
              sortOrder: ii,
            })),
          });
        }

        if (steps.length > 0) {
          await tx.recipeStep.createMany({
            data: steps.map((step, i) => ({
              recipeId: recipe.id,
              body: step.text.trim(),
              sectionHeader: null,
              sortOrder: i,
            })),
          });
        }

        return recipe;
      });

      const groupCount = groupedIngredients.size;
      const ingCount = ingredients.length;
      const stepCount = steps.length;
      console.log(
        `  CREATE "${v1.title}" ` +
        `(${groupCount} group${groupCount !== 1 ? "s" : ""}, ` +
        `${ingCount} ingredient${ingCount !== 1 ? "s" : ""}, ` +
        `${stepCount} step${stepCount !== 1 ? "s" : ""})`,
      );

      existingTitles.add(titleKey);
      created++;
    }

    console.log(
      `\n🎉  Migration complete. ` +
      `${created} recipe${created !== 1 ? "s" : ""} created, ` +
      `${skipped} skipped.`,
    );
  } finally {
    await prisma.$disconnect();
    await v1Pool.end();
    await v2Pool.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Migration failed:", err.message ?? err);
  process.exit(1);
});
