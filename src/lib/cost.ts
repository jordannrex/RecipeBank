// Shared cost aggregation for recipes and menus.
//
// Built on calcIngredientCost (src/lib/units.ts), which proportionally prices a
// single ingredient from a store package size + price. This module sums those
// per-ingredient costs the same way the recipe Price Calculator does, and adds
// menu-level aggregation so the Menus API and client stay consistent.

import { calcIngredientCost } from "./units";

/** Anything Prisma might hand us for a numeric column: Decimal, number, string, or null. */
type Decimalish = string | number | { toString(): string } | null | undefined;

function toStr(v: Decimalish): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : v.toString();
}

/** Multiply a quantity string by a scale factor, preserving null. */
function scaleQtyStr(qty: string | null, scale: number): string | null {
  if (qty == null) return null;
  if (scale === 1) return qty;
  const n = parseFloat(qty);
  if (isNaN(n)) return qty;
  return parseFloat((n * scale).toPrecision(4)).toString();
}

export type CostIngredient = {
  quantity: Decimalish;
  unit: string | null;
  storePkgQty: Decimalish;
  storePkgUnit: string | null;
  price: Decimalish;
};

/**
 * Sum the priced cost of a list of ingredients, scaled by `scale`
 * (= targetServings / baseServings).
 *
 * - `cost`    : running total of ingredients that produced an "ok" price, or
 *               null if none were priceable.
 * - `okCount` : how many ingredients contributed a price.
 * - `total`   : total ingredient count (used to detect a partial estimate).
 */
export function computeIngredientsCost(ingredients: CostIngredient[], scale = 1) {
  let cost: number | null = null;
  let okCount = 0;
  const total = ingredients.length;

  for (const ing of ingredients) {
    const storePkgQty = toStr(ing.storePkgQty);
    const price = toStr(ing.price);
    // No pricing entered for this ingredient: it can't contribute, but it still
    // counts toward `total` so the menu is correctly flagged as a partial estimate.
    if (!storePkgQty && !price) continue;

    const result = calcIngredientCost(
      scaleQtyStr(toStr(ing.quantity), scale),
      ing.unit ?? null,
      storePkgQty ?? "",
      ing.storePkgUnit ?? "",
      price ?? "",
    );
    if (result.status === "ok") {
      cost = (cost ?? 0) + result.cost;
      okCount++;
    }
  }

  return { cost, okCount, total };
}

export type MenuCostItemInput = {
  servings: number;
  recipe: {
    servings: number;
    ingredientGroups: Array<{ ingredients: CostIngredient[] }>;
  };
};

/**
 * Aggregate cost across every recipe in a menu. Each item is scaled to its own
 * `servings` relative to the recipe's base `servings`.
 *
 * Returns per-item costs (aligned to the input order), the menu total, and
 * whether the total is partial (some ingredient somewhere isn't priced).
 */
export function computeMenuCost(items: MenuCostItemInput[]) {
  const itemCosts: (number | null)[] = [];
  let totalCost: number | null = null;
  let okTotal = 0;
  let ingTotal = 0;

  for (const it of items) {
    const base = it.recipe.servings > 0 ? it.recipe.servings : 1;
    const scale = it.servings > 0 ? it.servings / base : 1;
    const ings = it.recipe.ingredientGroups.flatMap((g) => g.ingredients);
    const { cost, okCount, total } = computeIngredientsCost(ings, scale);
    itemCosts.push(cost);
    if (cost !== null) totalCost = (totalCost ?? 0) + cost;
    okTotal += okCount;
    ingTotal += total;
  }

  return {
    itemCosts,
    totalCost,
    isPartial: totalCost !== null && okTotal < ingTotal,
  };
}

/** Format a numeric cost as a display string, e.g. 12.5 → "$12.50". */
export function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Parse a formatted cost string ("$12.50", "~$12.50") back to a number, or null. */
export function parseCost(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}
