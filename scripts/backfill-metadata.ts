/**
 * backfill-metadata.ts
 *
 * Runs the same "Suggest Metadata" inference the in-app button uses, across all
 * of a user's recipes, filling ONLY fields that are currently missing. Already-
 * filled fields are never touched. Throttled + backs off on rate limits so it
 * won't overload the Gemini API.
 *
 * Fields considered "missing":
 *   cuisine / dishType / flavorProfile / description  → null or empty
 *   prepTimeMinutes / cookTimeMinutes                 → null
 *   complexity                                        → NONE (the unset default)
 *
 * Usage:
 *   npm run backfill:metadata             # DRY RUN — reports scope, writes nothing
 *   npm run backfill:metadata -- --apply  # actually fills missing fields
 *
 * Env (optional):
 *   BACKFILL_USERNAME  target username (default "jordan")
 *   BACKFILL_DELAY_MS  delay between Gemini calls (default 4500 ≈ 13/min)
 *   BACKFILL_LIMIT     cap how many recipes to process (for testing)
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const APPLY = process.argv.includes("--apply");
const USERNAME = process.env.BACKFILL_USERNAME ?? "jordan";
const DELAY_MS = Number(process.env.BACKFILL_DELAY_MS ?? 4500);
const LIMIT = process.env.BACKFILL_LIMIT ? Number(process.env.BACKFILL_LIMIT) : Infinity;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Suggestion = {
  cuisine: string | null;
  dishType: string | null;
  complexity: "EASY" | "MEDIUM" | "HARD" | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  flavorProfile: string | null;
  description: string | null;
};

const FIELDS = ["cuisine", "dishType", "complexity", "prepTimeMinutes", "cookTimeMinutes", "flavorProfile", "description"] as const;

function buildPrompt(r: {
  title: string; description: string | null;
  ingredientGroups: { ingredients: { name: string }[] }[];
  steps: { body: string }[];
}): string {
  const ingredients = r.ingredientGroups.flatMap((g) => g.ingredients.map((i) => i.name)).filter(Boolean);
  const ingredientText = ingredients.slice(0, 30).join(", ");
  const stepText = r.steps.map((s) => s.body).filter(Boolean).slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join("\n");

  return `You are a culinary expert. Given the recipe below, use your knowledge of this dish to fill in the metadata fields. Match the recipe to similar dishes you know — use the title, ingredients, and steps together to determine the most accurate values.

Return ONLY a JSON object with exactly these fields (use null only if you truly cannot determine a value):
{
  "cuisine": "the national or regional cuisine this dish belongs to, e.g. Italian, Mexican, American, Thai, Japanese",
  "dishType": "the category of dish, e.g. Pasta, Soup, Salad, Burger, Stir Fry, Tacos, Dessert, Breakfast",
  "complexity": "EASY, MEDIUM, or HARD based on technique and number of steps",
  "prepTimeMinutes": estimated prep time as a whole number,
  "cookTimeMinutes": estimated cook time as a whole number,
  "flavorProfile": "2-4 comma-separated flavor descriptors, e.g. savory, rich, spicy, tangy, umami",
  "description": "an appetizing 2-3 sentence description of the dish: name the main ingredients, cooking technique, flavor, and when you'd serve it. Write naturally, as if describing it to someone deciding what to cook tonight."
}

Recipe title: ${r.title}
${r.description ? `Description: ${r.description}` : ""}
${ingredientText ? `Ingredients: ${ingredientText}` : ""}
${stepText ? `Steps:\n${stepText}` : ""}`;
}

type RecipeRow = {
  id: string; title: string; description: string | null;
  cuisine: string | null; dishType: string | null;
  complexity: string; prepTimeMinutes: number | null; cookTimeMinutes: number | null;
  flavorProfile: string | null;
  ingredientGroups: { ingredients: { name: string }[] }[];
  steps: { body: string }[];
};

/** Which of the metadata fields are currently empty for this recipe. */
function missingFields(r: RecipeRow): Set<string> {
  const m = new Set<string>();
  if (!r.cuisine?.trim()) m.add("cuisine");
  if (!r.dishType?.trim()) m.add("dishType");
  if (r.complexity === "NONE") m.add("complexity");
  if (r.prepTimeMinutes == null) m.add("prepTimeMinutes");
  if (r.cookTimeMinutes == null) m.add("cookTimeMinutes");
  if (!r.flavorProfile?.trim()) m.add("flavorProfile");
  if (!r.description?.trim()) m.add("description");
  return m;
}

async function callGemini(model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>, prompt: string): Promise<Suggestion | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text()) as Suggestion;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const rateLimited = /429|rate|quota|RESOURCE_EXHAUSTED/i.test(msg);
      if (rateLimited && attempt < 3) {
        const wait = 30_000 * (attempt + 1);
        console.log(`    ⏳ rate limited — waiting ${wait / 1000}s then retrying…`);
        await sleep(wait);
        continue;
      }
      console.error(`    ✗ Gemini error: ${msg}`);
      return null;
    }
  }
  return null;
}

async function main() {
  console.log(`\n=== backfill-metadata (${APPLY ? "APPLY — will write" : "DRY RUN — no writes"}) ===`);
  console.log(`user="${USERNAME}"  delay=${DELAY_MS}ms${LIMIT !== Infinity ? `  limit=${LIMIT}` : ""}`);
  console.log(`DATABASE_URL set: ${!!process.env.DATABASE_URL}   GEMINI_API_KEY set: ${!!process.env.GEMINI_API_KEY}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const user = await prisma.user.findUnique({ where: { username: USERNAME }, select: { id: true } });
    if (!user) { console.error(`No user with username "${USERNAME}".`); return; }

    const recipes = (await prisma.recipe.findMany({
      where: { userId: user.id },
      select: {
        id: true, title: true, description: true, cuisine: true, dishType: true,
        complexity: true, prepTimeMinutes: true, cookTimeMinutes: true, flavorProfile: true,
        ingredientGroups: { select: { ingredients: { select: { name: true } } } },
        steps: { select: { body: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    })) as RecipeRow[];

    const needing = recipes.filter((r) => missingFields(r).size > 0);

    // Per-field missing tally
    const tally: Record<string, number> = {};
    for (const f of FIELDS) tally[f] = 0;
    for (const r of needing) for (const f of missingFields(r)) tally[f]++;

    const [{ nullEmbeddings }] = await prisma.$queryRawUnsafe<{ nullEmbeddings: bigint }[]>(
      `SELECT count(*)::bigint AS "nullEmbeddings" FROM recipes WHERE user_id = $1 AND embedding IS NULL`,
      user.id,
    );

    console.log(`Total recipes:           ${recipes.length}`);
    console.log(`Already complete:        ${recipes.length - needing.length}`);
    console.log(`With ≥1 missing field:   ${needing.length}   ← would be processed`);
    console.log(`Recipes w/o embedding:   ${Number(nullEmbeddings)} (separate from metadata; not touched here)`);
    console.log(`Missing-field breakdown:`);
    for (const f of FIELDS) console.log(`   ${f.padEnd(16)} ${tally[f]}`);
    const toProcess = Math.min(needing.length, LIMIT);
    console.log(`\nEstimated Gemini calls:  ${toProcess}`);
    console.log(`Estimated time (@${DELAY_MS}ms): ~${Math.ceil((toProcess * DELAY_MS) / 60000)} min\n`);

    if (!APPLY) {
      console.log("DRY RUN complete — no changes written. Re-run with --apply to fill missing fields.");
      return;
    }

    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
    const model = gemini.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json",
        // @ts-expect-error thinkingConfig valid for 2.5-flash
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let updated = 0, skipped = 0, failed = 0, processed = 0;
    for (const r of needing) {
      if (processed >= LIMIT) break;
      processed++;
      const miss = missingFields(r);
      process.stdout.write(`[${processed}/${toProcess}] ${r.title.slice(0, 50)} … `);

      const s = await callGemini(model, buildPrompt(r));
      if (!s) { failed++; console.log("FAILED (kept as-is)"); await sleep(DELAY_MS); continue; }

      const data: Record<string, unknown> = {};
      if (miss.has("cuisine") && s.cuisine) data.cuisine = s.cuisine;
      if (miss.has("dishType") && s.dishType) data.dishType = s.dishType;
      if (miss.has("complexity") && s.complexity && ["EASY", "MEDIUM", "HARD"].includes(s.complexity)) data.complexity = s.complexity;
      if (miss.has("prepTimeMinutes") && typeof s.prepTimeMinutes === "number") data.prepTimeMinutes = Math.max(0, Math.round(s.prepTimeMinutes));
      if (miss.has("cookTimeMinutes") && typeof s.cookTimeMinutes === "number") data.cookTimeMinutes = Math.max(0, Math.round(s.cookTimeMinutes));
      if (miss.has("flavorProfile") && s.flavorProfile) data.flavorProfile = s.flavorProfile;
      if (miss.has("description") && s.description) data.description = s.description;

      const keys = Object.keys(data);
      if (keys.length === 0) { skipped++; console.log("no new values"); await sleep(DELAY_MS); continue; }

      await prisma.recipe.update({ where: { id: r.id }, data });
      updated++;
      console.log(`filled: ${keys.join(", ")}`);
      await sleep(DELAY_MS);
    }

    console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed} (of ${toProcess} processed)`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
