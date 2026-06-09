/**
 * Recipe import pipeline.
 *
 * Strategy (applied in order):
 *  1. Detect platform — TikTok / Instagram / YouTube → caption-only path
 *  2. Pinterest → follow the source link if present, then continue as generic
 *  3. JSON-LD (schema.org/Recipe) — most structured, preferred
 *  4. HTML scraping with cheerio — common recipe-site patterns
 *  5. AI extraction fallback — Gemini (gemini-2.5-flash) on stripped page text
 *  6. AI metadata enrichment — fills cuisine, dishType, complexity, times
 */

import * as cheerio from "cheerio";
import { getGemini } from "@/lib/gemini";
import { assertPublicUrl } from "@/lib/url-guard";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ImportedIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  preparation: string | null;
};

export type ImportedGroup = {
  name: string;
  ingredients: ImportedIngredient[];
};

export type ImportedStep = {
  body: string;
  sectionHeader: string | null;
};

export type ImportedRecipe = {
  title: string;
  description: string | null;
  photoUrl: string | null;
  sourceUrl: string;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  complexity: "EASY" | "MEDIUM" | "HARD" | null;
  cuisine: string | null;
  dishType: string | null;
  flavorProfile: string | null;
  ingredientGroups: ImportedGroup[];
  steps: ImportedStep[];
};

export type ImportResult =
  | { ok: true; recipe: ImportedRecipe }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

type Platform = "tiktok" | "instagram" | "youtube" | "pinterest" | "generic";

function detectPlatform(url: string): Platform {
  const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "instagram.com" || h.endsWith(".instagram.com")) return "instagram";
  if (h === "youtube.com" || h === "youtu.be" || h.endsWith(".youtube.com")) return "youtube";
  if (h === "pinterest.com" || h.endsWith(".pinterest.com") || h === "pin.it") return "pinterest";
  return "generic";
}

// ---------------------------------------------------------------------------
// HTTP fetch with browser-like headers
// ---------------------------------------------------------------------------

async function fetchHtml(url: string, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  };

  try {
    // SSRF guard: validate the URL (and every redirect hop) against private,
    // loopback, link-local, and metadata addresses before fetching. Redirects
    // are followed manually so each new location is re-validated.
    let current = (await assertPublicUrl(url)).toString();

    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        signal: controller.signal,
        headers,
        redirect: "manual",
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error(`HTTP ${res.status} with no redirect target`);
        // Resolve relative redirects against the current URL, then re-validate.
        const next = new URL(location, current);
        current = (await assertPublicUrl(next.toString())).toString();
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }

    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// ISO 8601 duration parser  PT1H30M → 90
// ---------------------------------------------------------------------------

function parseDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  return (parseInt(m[1] ?? "0") * 60) + parseInt(m[2] ?? "0");
}

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

// JSON-LD ingredient strings look like "1 cup flour" — parse into parts
function parseIngredientString(raw: string): ImportedIngredient {
  const s = raw.trim();
  // Simple heuristic: first token(s) may be a number/fraction, next may be a unit
  const quantityUnits: Record<string, true> = {
    tsp: true, teaspoon: true, teaspoons: true,
    tbsp: true, tablespoon: true, tablespoons: true,
    cup: true, cups: true,
    oz: true, ounce: true, ounces: true,
    lb: true, lbs: true, pound: true, pounds: true,
    g: true, gram: true, grams: true,
    kg: true, ml: true, l: true, liter: true, liters: true,
    pinch: true, dash: true, clove: true, cloves: true,
    bunch: true, can: true, package: true, pkg: true,
    slice: true, slices: true, piece: true, pieces: true,
  };

  const tokens = s.split(/\s+/);
  let qty: number | null = null;
  let unit: string | null = null;
  let nameStart = 0;

  // First token: number or fraction (e.g., "1/2", "1.5", "1")
  const firstNum = tokens[0]?.replace(/¼|½|¾/, (c) =>
    c === "¼" ? "1/4" : c === "½" ? "1/2" : "3/4"
  );
  if (firstNum && /^[\d./]+$/.test(firstNum)) {
    const parts = firstNum.split("/");
    qty = parts.length === 2
      ? parseFloat(parts[0]) / parseFloat(parts[1])
      : parseFloat(firstNum);
    if (!isNaN(qty)) nameStart = 1;
  }
  // Mixed number: "1 1/2"
  if (nameStart === 1 && tokens[1] && /^\d+\/\d+$/.test(tokens[1])) {
    const [n, d] = tokens[1].split("/").map(Number);
    qty = (qty ?? 0) + n / d;
    nameStart = 2;
  }

  // Next token: unit?
  const nextTok = tokens[nameStart]?.toLowerCase().replace(/[^a-z]/g, "");
  if (nextTok && quantityUnits[nextTok]) {
    unit = tokens[nameStart];
    nameStart++;
  }

  const name = tokens.slice(nameStart).join(" ").trim() || s;
  return { name, quantity: qty, unit, preparation: null };
}

function extractFromJsonLd(html: string, baseUrl: string): Partial<ImportedRecipe> | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  let recipeData: Record<string, unknown> | null = null;

  scripts.each((_, el) => {
    if (recipeData) return;
    try {
      const raw = JSON.parse($(el).html() ?? "{}");
      const items: unknown[] = Array.isArray(raw)
        ? raw
        : raw["@graph"]
        ? (raw["@graph"] as unknown[])
        : [raw];
      for (const item of items) {
        const obj = item as Record<string, unknown>;
        const type = obj["@type"];
        const isRecipe =
          type === "Recipe" ||
          (Array.isArray(type) && (type as string[]).includes("Recipe"));
        if (isRecipe) { recipeData = obj; break; }
      }
    } catch { /* ignore parse errors */ }
  });

  if (!recipeData) return null;

  // Explicit cast — TypeScript loses track of the mutation through the cheerio callback
  const rd = recipeData as Record<string, unknown>;

  // Ingredients
  const rawIngs: string[] = Array.isArray(rd.recipeIngredient)
    ? (rd.recipeIngredient as unknown[]).map(String)
    : [];
  const ingredients = rawIngs.map(parseIngredientString);

  // Steps — handle HowToStep, HowToSection, and plain strings
  const steps: ImportedStep[] = [];
  const rawSteps = Array.isArray(rd.recipeInstructions) ? rd.recipeInstructions : [];
  for (const item of rawSteps as unknown[]) {
    const s = item as Record<string, unknown>;
    const type = s["@type"];
    if (type === "HowToSection") {
      const header = String(s.name ?? "");
      const subItems = Array.isArray(s.itemListElement) ? s.itemListElement : [];
      for (const sub of subItems as unknown[]) {
        const ss = sub as Record<string, unknown>;
        steps.push({ body: String(ss.text ?? ss.name ?? "").trim(), sectionHeader: header || null });
      }
    } else if (type === "HowToStep") {
      steps.push({ body: String(s.text ?? s.name ?? "").trim(), sectionHeader: null });
    } else if (typeof item === "string") {
      steps.push({ body: item.trim(), sectionHeader: null });
    }
  }

  // Photo
  const imageField = rd.image;
  let photoUrl: string | null = null;
  if (typeof imageField === "string") photoUrl = imageField;
  else if (Array.isArray(imageField) && typeof imageField[0] === "string") photoUrl = imageField[0] as string;
  else if (imageField && typeof imageField === "object") {
    const imgObj = imageField as Record<string, unknown>;
    photoUrl = typeof imgObj.url === "string" ? imgObj.url : null;
  }
  if (photoUrl && !photoUrl.startsWith("http")) {
    try { photoUrl = new URL(photoUrl, baseUrl).href; } catch { photoUrl = null; }
  }

  return {
    title: String(rd.name ?? "").trim() || undefined,
    description: typeof rd.description === "string" ? rd.description.trim() : null,
    photoUrl,
    servings: rd.recipeYield
      ? parseInt(String(Array.isArray(rd.recipeYield) ? rd.recipeYield[0] : rd.recipeYield))
      : null,
    prepTimeMinutes: parseDuration(rd.prepTime as string),
    cookTimeMinutes: parseDuration(rd.cookTime as string),
    cuisine: typeof rd.recipeCuisine === "string" ? rd.recipeCuisine : null,
    dishType: typeof rd.recipeCategory === "string" ? rd.recipeCategory : null,
    ingredientGroups:
      ingredients.length > 0
        ? [{ name: "", ingredients }]
        : [],
    steps: steps.filter((s) => s.body),
  } as Partial<ImportedRecipe>;
}

// ---------------------------------------------------------------------------
// HTML scraping fallback (cheerio)
// ---------------------------------------------------------------------------

function extractFromHtml(html: string, baseUrl: string): Partial<ImportedRecipe> {
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, header, aside, .ads, .advertisement, .comments, noscript").remove();

  const title =
    $('h1[class*="title" i], h1[class*="recipe" i], h1[itemprop="name"]').first().text().trim() ||
    $("h1").first().text().trim() ||
    $("title").text().replace(/\s*[-|].*$/, "").trim() ||
    "";

  const description =
    $('[class*="description" i][itemprop="description"], [class*="summary" i]').first().text().trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    null;

  // Photo
  let photoUrl: string | null = null;
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    try { photoUrl = new URL(ogImage, baseUrl).href; } catch { /* ignore */ }
  }
  if (!photoUrl) {
    const imgSrc =
      $('[class*="recipe" i] img, [class*="hero" i] img, article img').first().attr("src");
    if (imgSrc) {
      try { photoUrl = new URL(imgSrc, baseUrl).href; } catch { /* ignore */ }
    }
  }

  // Ingredients
  const ingredients: ImportedIngredient[] = [];
  $('[class*="ingredient" i] li, [itemprop="recipeIngredient"], [class*="ingredient-item" i]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) ingredients.push(parseIngredientString(text));
  });

  // Steps
  const steps: ImportedStep[] = [];
  $('[class*="instruction" i] li, [class*="step" i] li, [itemprop="recipeInstructions"] li').each((_, el) => {
    const body = $(el).text().trim();
    if (body) steps.push({ body, sectionHeader: null });
  });
  if (steps.length === 0) {
    $('[class*="instruction" i] p, [class*="step" i] p').each((_, el) => {
      const body = $(el).text().trim();
      if (body.length > 20) steps.push({ body, sectionHeader: null });
    });
  }

  // Times
  const prepTime = parseDuration($('[itemprop="prepTime"]').attr("datetime") ?? $('[class*="prep-time" i]').attr("content"));
  const cookTime = parseDuration($('[itemprop="cookTime"]').attr("datetime") ?? $('[class*="cook-time" i]').attr("content"));

  const servingsText =
    $('[itemprop="recipeYield"]').text().trim() ||
    $('[class*="yield" i], [class*="servings" i]').first().text().trim();
  const servings = servingsText ? parseInt(servingsText) : null;

  return {
    title: title || undefined,
    description,
    photoUrl,
    servings: servings && !isNaN(servings) ? servings : null,
    prepTimeMinutes: prepTime,
    cookTimeMinutes: cookTime,
    ingredientGroups: ingredients.length > 0 ? [{ name: "", ingredients }] : [],
    steps,
  };
}

// ---------------------------------------------------------------------------
// AI extraction fallback (Gemini gemini-2.5-flash)
// ---------------------------------------------------------------------------

/** Strip HTML to ~plain text, capped to keep tokens manageable. */
function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside, noscript").remove();
  return $.text().replace(/\s+/g, " ").trim().slice(0, 12_000);
}

async function extractWithAI(pageText: string, url: string): Promise<Partial<ImportedRecipe> | null> {
  const prompt = `Extract the recipe from this web page text. Return ONLY valid JSON — no markdown, no explanation.

Required JSON shape:
{
  "title": string,
  "description": string | null,
  "servings": number | null,
  "prepTimeMinutes": number | null,
  "cookTimeMinutes": number | null,
  "cuisine": string | null,
  "dishType": string | null,
  "ingredientGroups": [
    {
      "name": string,
      "ingredients": [
        { "name": string, "quantity": number | null, "unit": string | null, "preparation": string | null }
      ]
    }
  ],
  "steps": [{ "body": string, "sectionHeader": string | null }]
}

If the page does not contain a recipe, return: {"error": "no recipe found"}

Page URL: ${url}
Page text:
${pageText}`;

  try {
    const model = getGemini().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
        // @ts-expect-error — thinkingConfig valid for gemini-2.5-flash, not yet in SDK types
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const result = await model.generateContent(prompt);
    const json = JSON.parse(result.response.text());
    if (json.error) return null;
    return json as Partial<ImportedRecipe>;
  } catch (err) {
    console.error("[recipe-import] AI extraction failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI metadata enrichment (fills gaps: cuisine, dishType, complexity, times)
// ---------------------------------------------------------------------------

async function enrichMetadata(recipe: Partial<ImportedRecipe>): Promise<Partial<ImportedRecipe>> {
  const needsCuisine = !recipe.cuisine;
  const needsDishType = !recipe.dishType;
  const needsComplexity = !recipe.complexity;
  const needsTime = !recipe.prepTimeMinutes && !recipe.cookTimeMinutes;

  if (!needsCuisine && !needsDishType && !needsComplexity && !needsTime) return recipe;

  const ingredientText = recipe.ingredientGroups
    ?.flatMap((g) => g.ingredients.map((i) => i.name))
    .join(", ");

  const stepText = recipe.steps?.map((s, i) => `${i + 1}. ${s.body}`).slice(0, 10).join("\n");

  const prompt = `Given this recipe, return ONLY valid JSON with these fields (null if you cannot determine):
{
  ${needsCuisine ? `"cuisine": string | null,  // e.g. "Italian", "Mexican", "American"` : ""}
  ${needsDishType ? `"dishType": string | null,  // e.g. "Pasta", "Soup", "Salad", "Chicken"` : ""}
  ${needsComplexity ? `"complexity": "EASY" | "MEDIUM" | "HARD" | null,` : ""}
  ${needsTime ? `"prepTimeMinutes": number | null,\n  "cookTimeMinutes": number | null,` : ""}
  "flavorProfile": string | null  // 2-4 comma-separated descriptors e.g. "savory, rich, umami"
}

Recipe title: ${recipe.title ?? "unknown"}
Ingredients: ${ingredientText ?? "none"}
Steps (first 10):
${stepText ?? "none"}`;

  try {
    const model = getGemini().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        // @ts-expect-error — thinkingConfig valid for gemini-2.5-flash, not yet in SDK types
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const result = await model.generateContent(prompt);
    const json = JSON.parse(result.response.text());

    return {
      ...recipe,
      cuisine: recipe.cuisine ?? json.cuisine ?? null,
      dishType: recipe.dishType ?? json.dishType ?? null,
      complexity: recipe.complexity ?? json.complexity ?? null,
      prepTimeMinutes: recipe.prepTimeMinutes ?? json.prepTimeMinutes ?? null,
      cookTimeMinutes: recipe.cookTimeMinutes ?? json.cookTimeMinutes ?? null,
      flavorProfile: recipe.flavorProfile ?? json.flavorProfile ?? null,
    };
  } catch (err) {
    console.error("[recipe-import] metadata enrichment failed:", err);
    return recipe;
  }
}

// ---------------------------------------------------------------------------
// Platform-specific handlers
// ---------------------------------------------------------------------------

/**
 * TikTok / Instagram / YouTube — these are video platforms.
 * We look for recipe text in the caption/description only.
 * We never attempt video extraction.
 */
async function handleVideoplatform(html: string, url: string): Promise<ImportResult> {
  const $ = cheerio.load(html);

  // TikTok embeds recipe data in __NEXT_DATA__ or meta description
  const nextData = $("#__NEXT_DATA__").html();
  let captionText = "";
  if (nextData) {
    try {
      const data = JSON.parse(nextData);
      const desc: string =
        data?.props?.pageProps?.itemInfo?.itemStruct?.desc ??
        data?.props?.pageProps?.videoData?.itemInfos?.text ??
        "";
      captionText = desc;
    } catch { /* ignore */ }
  }

  if (!captionText) {
    captionText =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";
  }

  if (!captionText || captionText.length < 50) {
    return {
      ok: false,
      error:
        "No recipe found in the video caption. Video recipes can't be automatically extracted — try copying the caption or description and adding the recipe manually.",
    };
  }

  // See if the caption looks recipe-like (contains ingredient indicators)
  const looksLikeRecipe = /\b(ingredient|cup|tbsp|tsp|oz|gram|recipe|step|instructions?|mix|add|cook|bake|heat)\b/i.test(captionText);
  if (!looksLikeRecipe) {
    return {
      ok: false,
      error:
        "The video caption doesn't appear to contain a recipe. Add it manually using the recipe form.",
    };
  }

  // Try AI extraction on the caption text
  const extracted = await extractWithAI(captionText, url);
  if (!extracted?.title || (extracted.ingredientGroups?.length ?? 0) === 0) {
    return {
      ok: false,
      error:
        "A recipe was found in the caption but couldn't be parsed automatically. Try adding it manually.",
    };
  }

  const enriched = await enrichMetadata(extracted);
  return { ok: true, recipe: toImportedRecipe(enriched, url) };
}

/**
 * Pinterest — pins usually link out to an external recipe page.
 * Follow the source URL if present; otherwise scrape the pin page.
 */
async function handlePinterest(html: string, url: string): Promise<ImportResult> {
  const $ = cheerio.load(html);

  // Look for the canonical outbound link
  const sourceLink =
    $('a[data-test-id="pin-closeup-link"]').attr("href") ||
    $('a[href*="//"][class*="recipe" i]').attr("href") ||
    $('meta[property="og:see_also"]').attr("content") ||
    null;

  if (sourceLink) {
    try {
      const resolved = new URL(sourceLink, url).href;
      if (!resolved.includes("pinterest.com")) {
        const sourceHtml = await fetchHtml(resolved);
        return await importFromHtml(sourceHtml, resolved);
      }
    } catch { /* fall through to pin scrape */ }
  }

  // No outbound link — scrape the pin page itself
  return importFromHtml(html, url);
}

// ---------------------------------------------------------------------------
// Core HTML→recipe pipeline (JSON-LD → cheerio → AI)
// ---------------------------------------------------------------------------

async function importFromHtml(html: string, url: string): Promise<ImportResult> {
  // 1. JSON-LD — returns null if nothing useful was found
  const jsonLd = extractFromJsonLd(html, url);
  let partial: Partial<ImportedRecipe> = jsonLd ?? {};

  // 2. HTML scraping — skip entirely if JSON-LD already gave us a complete recipe
  const jsonLdComplete =
    !!jsonLd?.title &&
    (jsonLd.ingredientGroups?.length ?? 0) > 0 &&
    (jsonLd.ingredientGroups![0].ingredients.length ?? 0) > 0 &&
    (jsonLd.steps?.length ?? 0) > 0;

  if (!jsonLdComplete) {
    const htmlExtracted = extractFromHtml(html, url);
    if (!jsonLd) {
      // JSON-LD found nothing — use HTML extraction as the base
      partial = htmlExtracted;
    } else {
      // JSON-LD found something — merge, preferring JSON-LD but filling gaps from HTML
      partial.ingredientGroups = partial.ingredientGroups?.length
        ? partial.ingredientGroups
        : htmlExtracted.ingredientGroups ?? [];
      partial.steps = partial.steps?.length ? partial.steps : htmlExtracted.steps ?? [];
      partial.photoUrl = partial.photoUrl ?? htmlExtracted.photoUrl ?? null;
    }
  }

  // 3. AI extraction if we still don't have the core data
  const hasIngredients = (partial.ingredientGroups?.length ?? 0) > 0 &&
    partial.ingredientGroups![0].ingredients.length > 0;
  const hasSteps = (partial.steps?.length ?? 0) > 0;

  if (!partial.title || !hasIngredients || !hasSteps) {
    const pageText = htmlToText(html);
    const aiResult = await extractWithAI(pageText, url);
    if (aiResult) {
      partial = {
        title: partial.title || aiResult.title,
        description: partial.description ?? aiResult.description,
        photoUrl: partial.photoUrl ?? aiResult.photoUrl ?? null,
        servings: partial.servings ?? aiResult.servings,
        prepTimeMinutes: partial.prepTimeMinutes ?? aiResult.prepTimeMinutes,
        cookTimeMinutes: partial.cookTimeMinutes ?? aiResult.cookTimeMinutes,
        cuisine: partial.cuisine ?? aiResult.cuisine,
        dishType: partial.dishType ?? aiResult.dishType,
        ingredientGroups: hasIngredients ? partial.ingredientGroups! : (aiResult.ingredientGroups ?? []),
        steps: hasSteps ? partial.steps! : (aiResult.steps ?? []),
      };
    }
  }

  if (!partial.title) {
    return { ok: false, error: "Could not extract a recipe title from this page." };
  }

  // 4. AI metadata enrichment
  const enriched = await enrichMetadata(partial);
  return { ok: true, recipe: toImportedRecipe(enriched, url) };
}

// ---------------------------------------------------------------------------
// Normalise partial data into a full ImportedRecipe
// ---------------------------------------------------------------------------

/** Strip leading bullet/dash markers and numbered-list prefixes from a step body. */
function cleanStepText(text: string): string {
  return text
    // Collapse all newlines and carriage returns into a single space
    .replace(/[\r\n]+/g, " ")
    // Collapse any runs of whitespace created by the above
    .replace(/\s{2,}/g, " ")
    .trim()
    // Leading numbered list prefix: "1." "1)" "1:" "1-" or "Step 1:" etc.
    .replace(/^(?:step\s+)?\d+[\.\)\:\-]\s*/i, "")
    // Bullet/dash characters anywhere in the text (preceded by whitespace or start-of-string)
    // Covers: •  ·  ‣  ◦  ◆  ▪  ▸  ►  ➤  ➔  ✓  ✔  ‐  –  —  −  *  + and plain -
    .replace(/(?:^|\s)[•·‣◦◆▪▸►➤➔✓✔‐–—−\*\+](?=\s|$)/g, " ")
    // Clean up any double spaces left behind
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toImportedRecipe(partial: Partial<ImportedRecipe>, sourceUrl: string): ImportedRecipe {
  return {
    title: partial.title ?? "Untitled Recipe",
    description: partial.description ?? null,
    photoUrl: partial.photoUrl ?? null,
    sourceUrl,
    servings: partial.servings ?? null,
    prepTimeMinutes: partial.prepTimeMinutes ?? null,
    cookTimeMinutes: partial.cookTimeMinutes ?? null,
    complexity: partial.complexity ?? null,
    cuisine: partial.cuisine ?? null,
    dishType: partial.dishType ?? null,
    flavorProfile: partial.flavorProfile ?? null,
    ingredientGroups:
      partial.ingredientGroups?.length
        ? partial.ingredientGroups
        : [{ name: "", ingredients: [] }],
    steps: (partial.steps ?? []).map((s) => ({ ...s, body: cleanStepText(s.body) })),
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function importRecipeFromUrl(rawUrl: string): Promise<ImportResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL — please include https://" };
  }

  const platform = detectPlatform(url.href);

  try {
    const html = await fetchHtml(url.href);

    switch (platform) {
      case "tiktok":
      case "instagram":
      case "youtube":
        return handleVideoplatform(html, url.href);

      case "pinterest":
        return handlePinterest(html, url.href);

      default:
        return importFromHtml(html, url.href);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return { ok: false, error: "The page took too long to load. Try again or add the recipe manually." };
    }
    return { ok: false, error: `Could not reach this page: ${msg}` };
  }
}
