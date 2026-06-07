/**
 * paste-parser.ts
 *
 * Pure client-side parser that converts a freeform recipe paste
 * (from Notes, a blog, etc.) into structured RecipeBank data.
 *
 * No AI — just heuristics that work well when the text has clear
 * "Ingredients:" / "Instructions:" section headers. Falls back to
 * auto-detection when headers are missing.
 */

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type ParsedIngredient = {
  quantity: string;   // numeric string or "" (e.g. "1.5", "0.25")
  unit: string;       // e.g. "cup", "tbsp", ""
  name: string;       // e.g. "all-purpose flour"
  preparation: string; // e.g. "finely chopped", "at room temperature"
};

export type ParsedGroup = {
  name: string;                  // "" for the default group
  ingredients: ParsedIngredient[];
};

export type ParsedRecipe = {
  title: string;
  url: string | null;
  ingredientGroups: ParsedGroup[];
  steps: string[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Known cooking units (normalised lowercase)
// Keep in sync with units.ts volume/weight tables + count-style units.
// ---------------------------------------------------------------------------

const VOLUME_UNITS = new Set([
  'tsp', 'tsps', 'teaspoon', 'teaspoons',
  'tbsp', 'tbsps', 'tbs', 'tb', 'tablespoon', 'tablespoons',
  'floz', 'fl.oz', 'fluidounce', 'fluidounces',
  'cup', 'cups', 'c',
  'pt', 'pint', 'pints',
  'qt', 'quart', 'quarts',
  'gal', 'gallon', 'gallons',
  'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres',
  'cl', 'centiliter', 'centilitre',
  'dl', 'deciliter', 'decilitre',
  'l', 'liter', 'liters', 'litre', 'litres',
]);

const WEIGHT_UNITS = new Set([
  'oz', 'ounce', 'ounces',
  'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams',
  'kg', 'kilogram', 'kilograms',
  'mg', 'milligram', 'milligrams',
]);

const COUNT_UNITS = new Set([
  'pinch', 'pinches',
  'dash', 'dashes',
  'drop', 'drops',
  'clove', 'cloves',
  'slice', 'slices',
  'piece', 'pieces',
  'can', 'cans',
  'package', 'packages', 'pkg',
  'bunch', 'bunches',
  'head', 'heads',
  'stalk', 'stalks',
  'sprig', 'sprigs',
  'leaf', 'leaves',
  'stick', 'sticks',
  'sheet', 'sheets',
  'scoop', 'scoops',
  'handful', 'handfuls',
  'small', 'medium', 'large', 'whole',
]);

/** Normalise a unit token for lookup (lowercase, strip trailing dot). */
function normUnit(u: string): string {
  return u.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, '');
}

function isKnownUnit(word: string): boolean {
  const n = normUnit(word);
  return VOLUME_UNITS.has(n) || WEIGHT_UNITS.has(n) || COUNT_UNITS.has(n);
}

// ---------------------------------------------------------------------------
// Unicode fractions → decimal
// ---------------------------------------------------------------------------

const UNICODE_FRACS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/** Replace unicode fraction characters with ASCII-decimal equivalents. */
function expandUnicodeFracs(s: string): string {
  for (const [ch, val] of Object.entries(UNICODE_FRACS)) {
    // Insert spaces around the replacement so mixed numbers still parse
    s = s.replace(new RegExp(ch, 'g'), ` ${val} `);
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}

/** Parse a quantity string (int, decimal, fraction, mixed) → number string or "". */
function normaliseQty(raw: string): string {
  raw = expandUnicodeFracs(raw).trim();

  // Mixed: "1 1/2"
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const val = parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
    return String(Math.round(val * 10000) / 10000);
  }
  // Fraction: "3/4"
  const frac = raw.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const val = parseInt(frac[1]) / parseInt(frac[2]);
    return String(Math.round(val * 10000) / 10000);
  }
  // Decimal / integer
  const num = parseFloat(raw);
  return isNaN(num) ? '' : String(num);
}

// ---------------------------------------------------------------------------
// Line cleaning helpers
// ---------------------------------------------------------------------------

/** Strip leading bullet characters (hyphens, bullets, dashes, etc.). */
function stripBullet(line: string): string {
  return line
    .replace(/^[\s\-–—•*·‣◦◆▪▸►➤➔✓✔+#>]+\s*/, '')
    .trim();
}

/** Strip leading step numbering ("1.", "Step 2:", etc.). */
function stripNumbering(line: string): string {
  return line
    .replace(/^(?:step\s+)?\d+[\.\)\:\-]\s*/i, '')
    .trim();
}

/** Full step cleaning: bullets + numbering + inline bullets + collapse whitespace. */
function cleanStep(raw: string): string {
  let s = stripBullet(raw);
  s = stripNumbering(s);
  // Remove inline bullet characters surrounded by whitespace
  s = s
    .replace(/(?:^|\s)[•·‣◦◆▪▸►➤➔✓✔‐–—−*+](?=\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s;
}

// ---------------------------------------------------------------------------
// Ingredient line parser
// ---------------------------------------------------------------------------

/**
 * Parse one ingredient line into structured fields.
 * Returns null if the line is empty or looks like a section header.
 */
export function parseIngredientLine(raw: string): ParsedIngredient | null {
  // Remove bullet and expand unicode fracs
  let line = stripBullet(raw);
  line = expandUnicodeFracs(line).trim();
  if (!line || line.length < 2) return null;

  // Expand run-together metric quantities like "400g" → "400 g", "1.5kg" → "1.5 kg"
  line = line.replace(
    /(\d+\.?\d*)(g|kg|ml|l|oz|lb|lbs)\b/gi,
    (_, num, unit) => `${num} ${unit.toLowerCase()}`,
  );

  // Strip "(optional)" flag — we don't expose isOptional in the paste flow
  line = line.replace(/\(\s*optional\s*\)/gi, '').trim();
  // Strip "to taste" / "as needed" patterns ONLY when line has no leading number
  // (we keep them in the name otherwise)

  // ── Quantity ─────────────────────────────────────────────────────────────
  // Matches: integer, decimal, fraction, mixed number
  const QTY_RX = /^((?:\d+\.?\d*\s+)?\d+\/\d+|\d+\.?\d*)\s+/;
  let qty = '';
  const qtyMatch = line.match(QTY_RX);
  if (qtyMatch) {
    qty = normaliseQty(qtyMatch[1]);
    line = line.slice(qtyMatch[0].length).trim();
  }

  // ── Unit ─────────────────────────────────────────────────────────────────
  let unit = '';
  const words = line.split(/\s+/);

  // Check for two-word unit first ("fl oz")
  if (words.length >= 2 && isKnownUnit(words[0] + ' ' + words[1])) {
    unit = words[0] + ' ' + words[1];
    line = words.slice(2).join(' ').trim();
  } else if (words.length >= 1 && isKnownUnit(words[0])) {
    unit = words[0].replace(/\.$/, '');
    line = words.slice(1).join(' ').trim();
  }

  // ── Name + preparation (split on first comma not inside parentheses) ──────
  let name = line.trim();
  let preparation = '';

  // Find first comma that isn't inside ()
  let depth = 0;
  let commaIdx = -1;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '(') depth++;
    else if (name[i] === ')') depth--;
    else if (name[i] === ',' && depth === 0) { commaIdx = i; break; }
  }

  if (commaIdx > 0) {
    preparation = name.slice(commaIdx + 1).trim();
    name = name.slice(0, commaIdx).trim();
  }

  if (!name) return null;

  return { quantity: qty, unit, name, preparation };
}

// ---------------------------------------------------------------------------
// Section header patterns
// ---------------------------------------------------------------------------

const ING_HEADER_RX = /^(ingredients?(?:\s+list)?|what you(?:'ll)? need|you(?:'ll)? need|shopping list|for the (?:dish|recipe)|groceries)\s*:?\s*$/i;

const STEP_HEADER_RX = /^(instructions?|directions?|steps?|method|how to(?:\s+(?:make|cook|prepare|assemble))?|preparation|procedure|to make|to cook|to prepare)\s*:?\s*$/i;

/**
 * Detect an ingredient sub-group header:
 *   "For the sauce:", "Marinade:", "Dressing:", etc.
 * Must end with ":", be ≤ 60 chars, not start with a digit or bullet.
 */
function isSubGroupHeader(line: string): string | null {
  if (!/^[A-Za-z]/.test(line)) return null;
  const m = line.match(/^([A-Za-z][^:\n]{1,58}):\s*$/);
  if (!m) return null;
  // Exclude lines that look like ingredient entries ("Salt: to taste" → not a header)
  const label = m[1].trim();
  if (/\d/.test(label)) return null; // has a digit inside → probably not a header
  if (label.split(/\s+/).length > 8) return null; // too many words → not a header
  return label;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parsePastedRecipe(text: string): ParsedRecipe {
  const warnings: string[] = [];

  // ── Find URL ──────────────────────────────────────────────────────────────
  const rawLines = text.split('\n');
  const urlLine = rawLines.find((l) => /^\s*https?:\/\//i.test(l.trim()));
  const url = urlLine?.trim() ?? null;

  // Work on trimmed, non-empty lines excluding the URL
  const lines = rawLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== url);

  // ── State machine ─────────────────────────────────────────────────────────
  type Section = 'preamble' | 'ingredients' | 'steps';
  let section: Section = 'preamble';

  const preambleLines: string[] = [];
  const ingGroups: ParsedGroup[] = [];
  const stepLines: string[] = [];

  let currentGroup: ParsedGroup = { name: '', ingredients: [] };

  function flushGroup() {
    if (currentGroup.ingredients.length > 0) {
      ingGroups.push({ ...currentGroup, ingredients: [...currentGroup.ingredients] });
    }
    currentGroup = { name: '', ingredients: [] };
  }

  for (const line of lines) {
    // ── Section transitions ────────────────────────────────────────────────
    if (ING_HEADER_RX.test(line)) {
      if (section === 'ingredients') flushGroup();
      section = 'ingredients';
      continue;
    }

    if (STEP_HEADER_RX.test(line)) {
      if (section === 'ingredients') flushGroup();
      section = 'steps';
      continue;
    }

    // ── Preamble ───────────────────────────────────────────────────────────
    if (section === 'preamble') {
      preambleLines.push(line);
      continue;
    }

    // ── Ingredients ───────────────────────────────────────────────────────
    if (section === 'ingredients') {
      const sgLabel = isSubGroupHeader(line);
      if (sgLabel) {
        flushGroup();
        currentGroup = { name: sgLabel, ingredients: [] };
        continue;
      }

      const ing = parseIngredientLine(line);
      if (ing?.name) {
        currentGroup.ingredients.push(ing);
      }
      continue;
    }

    // ── Steps ─────────────────────────────────────────────────────────────
    if (section === 'steps') {
      // Step sub-section header (e.g. "To assemble:") → skip as a numbered step
      // but keep as a readable separator if short and title-cased
      if (/^[A-Z][^.!?\n]{2,50}:$/.test(line) && line.split(/\s+/).length <= 6) {
        // treat as a short section label — skip (could add sectionHeader support later)
        continue;
      }

      const cleaned = cleanStep(line);
      if (cleaned.length > 2) {
        stepLines.push(cleaned);
      }
      continue;
    }
  }

  // Flush final group
  flushGroup();

  // ── Extract title from preamble ──────────────────────────────────────────
  let title = '';
  for (const pl of preambleLines) {
    if (pl.trim() && pl.trim().length < 200 && !pl.startsWith('http')) {
      title = pl.trim();
      break;
    }
  }

  // ── Heuristic fallback when no section headers were found ─────────────────
  if (ingGroups.length === 0 && stepLines.length === 0 && lines.length > 2) {
    warnings.push(
      'No "Ingredients:" or "Instructions:" headers found — sections were auto-detected. Review carefully.',
    );

    const autoGroup: ParsedGroup = { name: '', ingredients: [] };
    let titleSet = !!title;

    for (const line of lines) {
      // Skip line already used as title
      if (!titleSet) { title = line; titleSet = true; continue; }
      if (line === title) continue;

      // Numbered step pattern
      if (/^(?:step\s+)?\d+[\.\)]\s+\w/i.test(line)) {
        const cleaned = cleanStep(line);
        if (cleaned) stepLines.push(cleaned);
        continue;
      }

      // Ingredient-like: stripped line starts with a number
      const stripped = stripBullet(line);
      if (/^\d/.test(stripped)) {
        const ing = parseIngredientLine(line);
        if (ing?.name) { autoGroup.ingredients.push(ing); continue; }
      }

      // Long prose → step
      if (line.length > 60) {
        stepLines.push(line);
      } else {
        // Short unknown → try ingredient
        const ing = parseIngredientLine(line);
        if (ing?.name && (ing.quantity || ing.unit)) {
          autoGroup.ingredients.push(ing);
        } else {
          // Treat as a step
          const cleaned = cleanStep(line);
          if (cleaned.length > 2) stepLines.push(cleaned);
        }
      }
    }

    if (autoGroup.ingredients.length > 0) ingGroups.push(autoGroup);
  }

  // ── Warnings ─────────────────────────────────────────────────────────────
  if (!title) {
    warnings.push('No title detected — add one manually in the form.');
  }
  if (ingGroups.length === 0) {
    warnings.push(
      'No ingredients detected. Add an "Ingredients:" header above your ingredient list.',
    );
  }
  if (stepLines.length === 0) {
    warnings.push(
      'No steps detected. Add an "Instructions:" header above your steps.',
    );
  }

  return { title, url, ingredientGroups: ingGroups, steps: stepLines, warnings };
}
