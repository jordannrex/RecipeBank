// Unit conversion and fraction display utilities (Section 6.4.5 & 7.4)

const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  "fl oz": 29.5735,
  ml: 1,
  l: 1000,
};

const WEIGHT_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

export type UnitCategory = "volume" | "weight" | "unknown";

export function getUnitCategory(unit: string): UnitCategory {
  const normalized = unit.toLowerCase().trim();
  if (normalized in VOLUME_TO_ML) return "volume";
  if (normalized in WEIGHT_TO_G) return "weight";
  return "unknown";
}

export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();
  const category = getUnitCategory(from);

  if (category === "volume" && to in VOLUME_TO_ML) {
    const ml = quantity * VOLUME_TO_ML[from];
    return Math.round((ml / VOLUME_TO_ML[to]) * 100) / 100;
  }

  if (category === "weight" && to in WEIGHT_TO_G) {
    const grams = quantity * WEIGHT_TO_G[from];
    return Math.round((grams / WEIGHT_TO_G[to]) * 100) / 100;
  }

  return null;
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
