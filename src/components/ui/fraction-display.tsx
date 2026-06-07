/**
 * Typographic fraction rendering.
 *
 * Uses <sup> / U+2044 FRACTION SLASH / <sub> so fractions look like
 * proper mixed-number typography (e.g. 1 ¾) rather than plain "1 3/4".
 */

import { cn } from "@/lib/utils";

// ─── internals ────────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function bestFraction(
  fractional: number,
  maxDen = 16,
): { num: number; den: number } {
  let bestNum = 1;
  let bestDen = 1;
  let bestError = Infinity;

  for (let den = 1; den <= maxDen; den++) {
    const num = Math.round(fractional * den);
    const error = Math.abs(fractional - num / den);
    if (error < bestError) {
      bestError = error;
      bestNum = num;
      bestDen = den;
    }
  }

  const d = gcd(bestNum, bestDen);
  return { num: bestNum / d, den: bestDen / d };
}

// ─── components ───────────────────────────────────────────────────────────────

/**
 * Renders a single p/q fraction using raised numerator + diagonal slash + lowered denominator.
 */
function FracPart({ num, den }: { num: number; den: number }) {
  return (
    <span className="inline-flex items-baseline">
      {/* Numerator — raised */}
      <sup className="text-[0.6em] font-semibold leading-none">{num}</sup>
      {/* U+2044 FRACTION SLASH — more diagonal than the regular solidus */}
      <span className="mx-[0.06em] text-[0.9em] leading-none" aria-hidden="true">
        ⁄
      </span>
      {/* Denominator — lowered */}
      <sub className="text-[0.6em] font-semibold leading-none">{den}</sub>
    </span>
  );
}

/**
 * Renders a number as a typographic mixed-number fraction.
 *
 * @example
 *   <FractionDisplay value={0.5}  />  →  ½
 *   <FractionDisplay value={1.75} />  →  1 ¾
 *   <FractionDisplay value={2}    />  →  2
 */
export function FractionDisplay({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  if (value === 0) return <span className={className}>0</span>;

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const fractional = abs - whole;

  // No meaningful fractional part — just the whole number.
  if (fractional < 0.001) {
    return (
      <span className={className}>
        {sign}
        {whole}
      </span>
    );
  }

  const { num, den } = bestFraction(fractional);

  return (
    <span className={cn("tabular-nums", className)}>
      {sign}
      {whole > 0 && (
        <>
          {whole}
          <span className="mx-[0.15em]" />
        </>
      )}
      <FracPart num={num} den={den} />
    </span>
  );
}

/**
 * Convenience wrapper: renders `quantity` as a fraction followed by `unit`.
 * Returns null when both are absent.
 */
export function QtyUnit({
  quantity,
  unit,
  className,
}: {
  quantity: number | string | null | undefined;
  unit: string | null | undefined;
  className?: string;
}) {
  const num =
    quantity == null
      ? null
      : typeof quantity === "number"
        ? quantity
        : parseFloat(quantity as string);

  const hasQty = num != null && !isNaN(num);
  const hasUnit = !!unit;

  if (!hasQty && !hasUnit) return null;

  return (
    <span className={className}>
      {hasQty && <FractionDisplay value={num!} />}
      {hasQty && hasUnit && <span className="ml-1">{unit}</span>}
      {!hasQty && hasUnit && unit}
    </span>
  );
}
