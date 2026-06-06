// Unit conversion and fraction display utilities

// ─── Normalise a unit string for lookup ──────────────────────────────────────

function norm(u: string): string {
  return u.trim().toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
}

// ─── Conversion tables ───────────────────────────────────────────────────────
// Values are multipliers to reach the base unit (ml for volume, g for weight).

const VOLUME_TO_ML: Record<string, number> = {
  // teaspoon
  tsp: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892,
  // tablespoon
  tbsp: 14.7868, tbs: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  // fluid ounce
  "floz": 29.5735, "fl.oz": 29.5735, fluidounce: 29.5735, fluidounces: 29.5735,
  // cup
  cup: 236.588, cups: 236.588, c: 236.588,
  // pint
  pt: 473.176, pint: 473.176, pints: 473.176,
  // quart
  qt: 946.353, quart: 946.353, quarts: 946.353,
  // gallon
  gal: 3785.41, gallon: 3785.41, gallons: 3785.41,
  // metric
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  cl: 10, centiliter: 10, centilitre: 10,
  dl: 100, deciliter: 100, decilitre: 100,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
};

const WEIGHT_TO_G: Record<string, number> = {
  // imperial
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  // metric
  mg: 0.001, milligram: 0.001, milligrams: 0.001,
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
};

// ─── Public category helper (used elsewhere in the app) ──────────────────────

export type UnitCategory = "volume" | "weight" | "unknown";

export function getUnitCategory(unit: string): UnitCategory {
  const n = norm(unit);
  if (n in VOLUME_TO_ML) return "volume";
  if (n in WEIGHT_TO_G)  return "weight";
  return "unknown";
}

// ─── General-purpose unit converter (used elsewhere in the app) ──────────────

export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = norm(fromUnit);
  const to   = norm(toUnit);

  if (from in VOLUME_TO_ML && to in VOLUME_TO_ML) {
    return Math.round(((quantity * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to]) * 10000) / 10000;
  }
  if (from in WEIGHT_TO_G && to in WEIGHT_TO_G) {
    return Math.round(((quantity * WEIGHT_TO_G[from]) / WEIGHT_TO_G[to]) * 10000) / 10000;
  }
  return null;
}

// ─── Price Calculator cost result ────────────────────────────────────────────

export type CalcResult =
  | { status: "ok";           cost: number }
  | { status: "missing" }                        // inputs not filled in yet
  | { status: "incompatible"; hint: string }     // volume vs weight mismatch
  | { status: "unknown";      hint: string };    // unrecognised units that differ

/**
 * Calculate the proportional cost of the recipe amount given a store package.
 *
 * Examples:
 *   recipe: 1/4 cup  |  store: 750 ml @ $12  →  converts both to ml, divides
 *   recipe: 2 lb     |  store: 1 kg   @ $8   →  converts both to g, divides
 *   recipe: 3 eggs   |  store: 12 (no unit)  →  same-unit raw division
 */
export function calcIngredientCost(
  recipeQty:    string | null,
  recipeUnit:   string | null,
  storePkgQty:  string,
  storePkgUnit: string,
  price:        string,
): CalcResult {
  const rq = recipeQty ? parseFloat(recipeQty) : null;
  const sq = parseFloat(storePkgQty);
  const p  = parseFloat(price);

  if (!rq || isNaN(sq) || isNaN(p) || sq <= 0 || p < 0) {
    return { status: "missing" };
  }

  const ru = recipeUnit   ? norm(recipeUnit)   : "";
  const su = storePkgUnit ? norm(storePkgUnit) : "";

  // Identical units (including both empty) → raw division, no conversion.
  if (ru === su) {
    return { status: "ok", cost: (rq / sq) * p };
  }

  const ruVol = ru in VOLUME_TO_ML;
  const suVol = su in VOLUME_TO_ML;
  const ruWt  = ru in WEIGHT_TO_G;
  const suWt  = su in WEIGHT_TO_G;

  // Both volume → convert to ml.
  if (ruVol && suVol) {
    return { status: "ok", cost: ((rq * VOLUME_TO_ML[ru]) / (sq * VOLUME_TO_ML[su])) * p };
  }
  // Both weight → convert to g.
  if (ruWt && suWt) {
    return { status: "ok", cost: ((rq * WEIGHT_TO_G[ru]) / (sq * WEIGHT_TO_G[su])) * p };
  }
  // One volume, one weight → physically incompatible.
  if ((ruVol || ruWt) && (suVol || suWt)) {
    return {
      status: "incompatible",
      hint: `Can't convert ${recipeUnit ?? "no unit"} (${ruVol ? "volume" : "weight"}) to ${storePkgUnit} (${suVol ? "volume" : "weight"})`,
    };
  }
  // At least one unit is unrecognised and they differ.
  return {
    status: "unknown",
    hint: `Units differ: recipe uses "${recipeUnit ?? "none"}", store pkg uses "${storePkgUnit || "none"}" — enter matching units or the same unit on both sides`,
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function decimalToFraction(value: number, maxDenominator = 16): string {
  if (value === 0) return "0";

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const fractional = abs - whole;

  if (fractional < 0.001) {
    return `${sign}${whole}`;
  }

  let bestNum = 1;
  let bestDen = 1;
  let bestError = Math.abs(fractional - 1);

  for (let den = 1; den <= maxDenominator; den++) {
    const num = Math.round(fractional * den);
    const error = Math.abs(fractional - num / den);
    if (error < bestError) {
      bestError = error;
      bestNum = num;
      bestDen = den;
    }
  }

  const divisor = gcd(bestNum, bestDen);
  const num = bestNum / divisor;
  const den = bestDen / divisor;

  if (whole === 0) {
    return `${sign}${num}/${den}`;
  }
  return `${sign}${whole} ${num}/${den}`;
}
