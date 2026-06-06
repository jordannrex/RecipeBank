"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { calcIngredientCost } from "@/lib/units";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RecipeNotesSection } from "@/components/recipes/recipe-notes-section";
import { RecipeCookLogSection } from "@/components/recipes/recipe-cook-log-section";
import { cn } from "@/lib/utils";
import type { RecipeMode, SerializedRecipeWithRelations } from "@/types/recipe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const complexityDot: Record<string, string> = {
  EASY: "#22c55e",
  MEDIUM: "#f59e0b",
  HARD: "#ef4444",
};
const complexityLabel: Record<string, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

function formatTime(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatIngredient(name: string, quantity: string | null, unit: string | null, prep: string | null): string {
  const q = quantity ? parseFloat(quantity) : null;
  const parts = [q ? String(q) : null, unit || null, name, prep ? `(${prep})` : null];
  return parts.filter(Boolean).join(" ");
}

/** Resize an image file to at most maxDim × maxDim, returns a JPEG data URL. */
async function resizeImage(file: File, maxDim = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Edit state types
// ---------------------------------------------------------------------------

type EditIngredient = {
  name: string;
  quantity: string;
  unit: string;
  preparation: string;
  isOptional: boolean;
};

type EditGroup = {
  name: string;
  ingredients: EditIngredient[];
};

type EditStep = {
  body: string;
  sectionHeader: string;
};

type EditState = {
  title: string;
  description: string;
  cuisine: string;
  dishType: string;
  complexity: "EASY" | "MEDIUM" | "HARD";
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  servings: string;
  photoUrl: string | null;
  groups: EditGroup[];
  steps: EditStep[];
};

function initEditState(r: SerializedRecipeWithRelations): EditState {
  return {
    title: r.title,
    description: r.description ?? "",
    cuisine: r.cuisine ?? "",
    dishType: r.dishType ?? "",
    complexity: r.complexity,
    prepTimeMinutes: r.prepTimeMinutes?.toString() ?? "",
    cookTimeMinutes: r.cookTimeMinutes?.toString() ?? "",
    servings: r.servings.toString(),
    photoUrl: r.photoUrl ?? null,
    groups: r.ingredientGroups.length > 0
      ? r.ingredientGroups.map((g) => ({
          name: g.name,
          ingredients: g.ingredients.length > 0
            ? g.ingredients.map((i) => ({
                name: i.name,
                quantity: i.quantity?.toString() ?? "",
                unit: i.unit ?? "",
                preparation: i.preparation ?? "",
                isOptional: i.isOptional,
              }))
            : [{ name: "", quantity: "", unit: "", preparation: "", isOptional: false }],
        }))
      : [{ name: "", ingredients: [{ name: "", quantity: "", unit: "", preparation: "", isOptional: false }] }],
    steps: r.steps.length > 0
      ? r.steps.map((s) => ({ body: s.body, sectionHeader: s.sectionHeader ?? "" }))
      : [{ body: "", sectionHeader: "" }],
  };
}

function buildPatchPayload(edit: EditState) {
  return {
    title: edit.title.trim(),
    description: edit.description.trim() || null,
    cuisine: edit.cuisine.trim() || null,
    dishType: edit.dishType.trim() || null,
    complexity: edit.complexity,
    prepTimeMinutes: edit.prepTimeMinutes ? parseInt(edit.prepTimeMinutes, 10) : null,
    cookTimeMinutes: edit.cookTimeMinutes ? parseInt(edit.cookTimeMinutes, 10) : null,
    servings: parseInt(edit.servings, 10) || 4,
    photoUrl: edit.photoUrl,
    ingredientGroups: edit.groups
      .filter((g) => g.ingredients.some((i) => i.name.trim()))
      .map((g, gi) => ({
        name: g.name,
        sortOrder: gi,
        ingredients: g.ingredients
          .filter((i) => i.name.trim())
          .map((i, ii) => ({
            name: i.name.trim(),
            quantity: i.quantity ? parseFloat(i.quantity) : null,
            unit: i.unit.trim() || null,
            preparation: i.preparation.trim() || null,
            isOptional: i.isOptional,
            sortOrder: ii,
          })),
      })),
    steps: edit.steps
      .filter((s) => s.body.trim())
      .map((s, si) => ({
        body: s.body.trim(),
        sectionHeader: s.sectionHeader.trim() || null,
        sortOrder: si,
      })),
  };
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted">
      {icon}
      {label}
    </span>
  );
}

function ViewMode({
  recipe,
  currentServings,
  baseServings,
  onServingsChange,
}: {
  recipe: SerializedRecipeWithRelations;
  currentServings: number;
  baseServings: number;
  onServingsChange: (n: number) => void;
}) {
  const totalTime =
    (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0) || null;
  const scale = baseServings > 0 ? currentServings / baseServings : 1;
  const isScaled = currentServings !== baseServings;

  return (
    <div className="space-y-6">
      {/* Meta row */}
      <div className="flex flex-wrap gap-2">
        {totalTime && (
          <MetaChip
            icon={
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            }
            label={formatTime(totalTime)}
          />
        )}
        {recipe.prepTimeMinutes && (
          <MetaChip
            icon={<span className="text-[10px]">prep</span>}
            label={formatTime(recipe.prepTimeMinutes)}
          />
        )}
        {recipe.cookTimeMinutes && (
          <MetaChip
            icon={<span className="text-[10px]">cook</span>}
            label={formatTime(recipe.cookTimeMinutes)}
          />
        )}

        {/* Interactive servings stepper (replaces static MetaChip) */}
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs text-muted">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <button
            type="button"
            onClick={() => onServingsChange(Math.max(1, currentServings - 1))}
            className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-card-hover hover:text-text"
            aria-label="Decrease servings"
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M2 5h6"/></svg>
          </button>
          <span className={cn("min-w-[1.25rem] text-center font-semibold", isScaled ? "text-highlight" : "text-text")}>
            {currentServings}
          </span>
          <button
            type="button"
            onClick={() => onServingsChange(Math.min(100, currentServings + 1))}
            className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-card-hover hover:text-text"
            aria-label="Increase servings"
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 2v6M2 5h6"/></svg>
          </button>
          <span>servings</span>
          {isScaled && (
            <button
              type="button"
              onClick={() => onServingsChange(baseServings)}
              className="ml-0.5 text-text/50 transition-colors hover:text-highlight"
              aria-label={`Reset to ${baseServings} servings`}
              title={`Reset to ${baseServings} servings`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted">
          <span
            className="inline-block h-2 w-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: complexityDot[recipe.complexity] ?? "#71717a" }}
          />
          {complexityLabel[recipe.complexity] ?? recipe.complexity}
        </span>
        {recipe.cuisine && <Badge className="text-xs px-2.5 py-1">{recipe.cuisine}</Badge>}
        {recipe.dishType && <Badge className="text-xs px-2.5 py-1">{recipe.dishType}</Badge>}
        {recipe.cookCount > 0 && (
          <MetaChip
            icon={
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3"/>
                <polyline points="9 11 12 14 22 4"/>
              </svg>
            }
            label={`Cooked ${recipe.cookCount}×`}
          />
        )}
      </div>

      {/* Description */}
      {recipe.description && (
        <p className="text-sm text-muted leading-relaxed">{recipe.description}</p>
      )}

      {/* Ingredients */}
      {recipe.ingredientGroups.length > 0 && (
        <section aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading" className="mb-3 text-base font-semibold text-text">Ingredients</h2>
          <div className="space-y-4">
            {recipe.ingredientGroups.map((group) => (
              <div key={group.id}>
                {group.name && (
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{group.name}</p>
                )}
                <ul className="space-y-1">
                  {group.ingredients.map((ing) => (
                    <li key={ing.id} className="flex items-baseline gap-2 text-sm">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted" aria-hidden="true" />
                      <span className={ing.isOptional ? "text-muted" : "text-text"}>
                        {formatIngredient(ing.name, scaleQty(ing.quantity, scale), ing.unit, ing.preparation)}
                        {ing.isOptional && <span className="ml-1 text-xs text-muted">(optional)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Steps */}
      {recipe.steps.length > 0 && (
        <section aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="mb-3 text-base font-semibold text-text">Instructions</h2>
          <ol className="space-y-4">
            {recipe.steps.map((step, idx) => (
              <li key={step.id}>
                {step.sectionHeader && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{step.sectionHeader}</p>
                )}
                <div className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-highlight text-xs font-bold text-brand-white"
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <p className="text-sm text-text leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.flavorProfile && (
        <section>
          <h2 className="mb-1 text-base font-semibold text-text">Flavor Profile</h2>
          <p className="text-sm text-muted leading-relaxed">{recipe.flavorProfile}</p>
        </section>
      )}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function fmtQtyUnit(quantity: string | null, unit: string | null): string {
  const q = quantity ? String(parseFloat(quantity)) : null;
  return [q, unit].filter(Boolean).join(" ");
}

/**
 * Multiply a DB quantity string by a scale factor.
 * Returns the original value when scale === 1 or qty is null.
 * Uses toPrecision(4) to avoid floating-point noise (e.g. 0.33333333).
 */
function scaleQty(qty: string | null, scale: number): string | null {
  if (!qty || scale === 1) return qty;
  const n = parseFloat(qty);
  if (isNaN(n)) return qty;
  return parseFloat((n * scale).toPrecision(4)).toString();
}

// ── Shopping List mode ──────────────────────────────────────────────────────

function ShoppingListMode({ recipe }: { recipe: SerializedRecipeWithRelations }) {
  const [needIt, setNeedIt] = useState<Map<string, string>>(new Map());
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const allIngredients = recipe.ingredientGroups.flatMap((g) =>
    g.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
    }))
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/shopping/items?recipeId=${recipe.id}`);
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const item of json.data.items as { id: string; ingredientId: string }[]) {
          map.set(item.ingredientId, item.id);
        }
        setNeedIt(map);
        setLoadingState("ready");
      } catch {
        if (!cancelled) setLoadingState("error");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [recipe.id]);

  async function toggle(ingredientId: string, name: string, quantity: string | null, unit: string | null) {
    if (toggling.has(ingredientId)) return;
    setToggling((prev) => new Set(prev).add(ingredientId));
    const existingId = needIt.get(ingredientId);
    try {
      if (existingId) {
        const res = await fetch(`/api/shopping/items/${existingId}`, { method: "DELETE" });
        if (res.ok) setNeedIt((prev) => { const m = new Map(prev); m.delete(ingredientId); return m; });
      } else {
        const res = await fetch("/api/shopping/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipeId: recipe.id,
            recipeName: recipe.title,
            ingredientId,
            name,
            quantity: quantity ? parseFloat(quantity) : null,
            unit: unit ?? null,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setNeedIt((prev) => new Map(prev).set(ingredientId, json.data.id));
        }
      }
    } finally {
      setToggling((prev) => { const s = new Set(prev); s.delete(ingredientId); return s; });
    }
  }

  if (loadingState === "loading") {
    return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  }

  const needToBuy = allIngredients.filter((i) => needIt.has(i.id));
  const haveIt    = allIngredients.filter((i) => !needIt.has(i.id));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Mark ingredients you still need to buy. They&apos;ll be added to your Shopping List.
      </p>

      {allIngredients.length === 0 && (
        <p className="text-sm text-muted">No ingredients added yet.</p>
      )}

      {/* ── Need to Buy ───────────────────────────────────────── */}
      {needToBuy.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text/50">
            Need to Buy · {needToBuy.length}
          </p>
          <ul className="space-y-2">
            {needToBuy.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={toggling.has(item.id)}
                  onClick={() => toggle(item.id, item.name, item.quantity, item.unit)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-card-hover disabled:opacity-60"
                >
                  {/* Filled checkbox */}
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-text">
                    <svg className="h-3 w-3 text-background" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  </span>
                  <span className="flex-1 text-sm font-semibold text-text">{item.name}</span>
                  <span className="text-sm text-text/60">{fmtQtyUnit(item.quantity, item.unit)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Have It ───────────────────────────────────────────── */}
      {haveIt.length > 0 && (
        <div className="space-y-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text/50">
            Have It · {haveIt.length}
          </p>
          <ul>
            {haveIt.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={toggling.has(item.id)}
                  onClick={() => toggle(item.id, item.name, item.quantity, item.unit)}
                  className="flex w-full items-center gap-3 border-b border-border/50 px-1 py-3 text-left transition-colors last:border-b-0 hover:bg-card-hover disabled:opacity-60"
                >
                  {/* Empty checkbox */}
                  <span className="h-5 w-5 shrink-0 rounded border-2 border-border/60" />
                  <span className="flex-1 text-sm text-text/70">{item.name}</span>
                  <span className="text-sm text-text/40">{fmtQtyUnit(item.quantity, item.unit)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Price Calculator mode ───────────────────────────────────────────────────

type PriceRow = { storePkgQty: string; storePkgUnit: string; price: string };

function PriceCalculatorMode({
  recipe,
  currentServings,
  baseServings,
  onServingsChange,
}: {
  recipe: SerializedRecipeWithRelations;
  currentServings: number;
  baseServings: number;
  onServingsChange: (n: number) => void;
}) {
  const allIngredients = recipe.ingredientGroups.flatMap((g) =>
    g.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
    }))
  );

  const scale = baseServings > 0 ? currentServings / baseServings : 1;

  const [rows, setRows] = useState<Record<string, PriceRow>>(() =>
    Object.fromEntries(
      allIngredients.map((i) => [i.id, { storePkgQty: "", storePkgUnit: i.unit ?? "", price: "" }])
    )
  );

  function setField(id: string, field: keyof PriceRow, val: string) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  }

  const totalCost = allIngredients.reduce<number | null>((acc, ing) => {
    const row    = rows[ing.id];
    if (!row) return acc;
    const result = calcIngredientCost(scaleQty(ing.quantity, scale), ing.unit, row.storePkgQty, row.storePkgUnit, row.price);
    if (result.status !== "ok") return acc;
    return (acc ?? 0) + result.cost;
  }, null);

  const hasAnyInput = allIngredients.some((i) => {
    const r = rows[i.id];
    return r && (r.storePkgQty || r.price);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Enter the store package size and price. RecipeBank calculates your actual cost for the recipe amount.
        </p>
        {/* Servings stepper — shared with View mode */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-text/50">Servings</span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1">
            <button
              type="button"
              onClick={() => onServingsChange(Math.max(1, currentServings - 1))}
              className="flex h-5 w-5 items-center justify-center rounded text-text/60 transition-colors hover:bg-card-hover hover:text-text"
              aria-label="Decrease servings"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M2 6h8"/></svg>
            </button>
            <span className={cn("w-6 text-center text-sm font-semibold", currentServings !== baseServings ? "text-highlight" : "text-text")}>
              {currentServings}
            </span>
            <button
              type="button"
              onClick={() => onServingsChange(Math.min(100, currentServings + 1))}
              className="flex h-5 w-5 items-center justify-center rounded text-text/60 transition-colors hover:bg-card-hover hover:text-text"
              aria-label="Increase servings"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M6 2v8M2 6h8"/></svg>
            </button>
          </div>
          {currentServings !== baseServings && (
            <button
              type="button"
              onClick={() => onServingsChange(baseServings)}
              className="text-xs text-text/50 transition-colors hover:text-highlight"
              title={`Reset to ${baseServings}`}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {allIngredients.length === 0 ? (
        <p className="text-sm text-muted">No ingredients added yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border bg-card px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-text/50">Ingredient</span>
            <span className="w-36 text-right text-xs font-semibold uppercase tracking-wider text-text/50">Store Pkg</span>
            <span className="w-24 text-right text-xs font-semibold uppercase tracking-wider text-text/50">Price</span>
            <span className="w-16 text-right text-xs font-semibold uppercase tracking-wider text-text/50">Cost</span>
          </div>

          {/* Rows */}
          {allIngredients.map((ing) => {
            const row    = rows[ing.id] ?? { storePkgQty: "", storePkgUnit: ing.unit ?? "", price: "" };
            const sq     = scaleQty(ing.quantity, scale);
            const result = calcIngredientCost(sq, ing.unit, row.storePkgQty, row.storePkgUnit, row.price);
            const recipeLabel = fmtQtyUnit(sq, ing.unit);
            return (
              <div
                key={ing.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-border/60 px-4 py-3 last:border-b-0"
              >
                {/* Ingredient */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{ing.name}</p>
                  {recipeLabel && (
                    <p className="text-xs text-muted">Recipe: {recipeLabel}</p>
                  )}
                </div>

                {/* Store pkg: qty + unit */}
                <div className="flex w-36 items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.storePkgQty}
                    onChange={(e) => setField(ing.id, "storePkgQty", e.target.value)}
                    placeholder="qty"
                    className="w-14 border-b border-border/60 bg-transparent py-0.5 text-right text-sm text-text outline-none placeholder:text-text/30 focus:border-highlight"
                  />
                  <input
                    type="text"
                    value={row.storePkgUnit}
                    onChange={(e) => setField(ing.id, "storePkgUnit", e.target.value)}
                    placeholder="unit"
                    className="w-16 border-b border-border/60 bg-transparent py-0.5 text-right text-sm text-text outline-none placeholder:text-text/30 focus:border-highlight"
                  />
                </div>

                {/* Price */}
                <div className="flex w-24 items-center gap-1">
                  <span className="text-sm text-text/50">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.price}
                    onChange={(e) => setField(ing.id, "price", e.target.value)}
                    placeholder="0.00"
                    className="w-full border-b border-border/60 bg-transparent py-0.5 text-right text-sm text-text outline-none placeholder:text-text/30 focus:border-highlight"
                  />
                </div>

                {/* Calculated cost */}
                <div className="w-16 text-right">
                  {result.status === "ok" ? (
                    <span className="text-sm text-text">${result.cost.toFixed(2)}</span>
                  ) : result.status === "incompatible" || result.status === "unknown" ? (
                    <span
                      className="cursor-help text-sm text-amber-500"
                      title={result.hint}
                    >
                      ⚠️
                    </span>
                  ) : (
                    <span className="text-sm text-text/30">—</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
            <span className="text-sm font-semibold text-text">Estimated recipe cost</span>
            {totalCost !== null ? (
              <span className="text-sm font-semibold text-text">${totalCost.toFixed(2)}</span>
            ) : (
              <span className="text-sm text-text/40">
                {hasAnyInput ? "Complete store pkg + price" : "Enter prices above"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag-and-drop sub-components for EditMode
// ---------------------------------------------------------------------------

/** Grip icon shown on drag handles */
function GripIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

function SortableIngredientRow({
  id,
  ing,
  canRemove,
  onSet,
  onRemove,
}: {
  id: string;
  ing: EditIngredient;
  canRemove: boolean;
  onSet: (field: keyof EditIngredient, val: string | boolean) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-start">
      {/* Drag handle */}
      <button
        type="button"
        className="mt-2 flex-shrink-0 cursor-grab touch-none text-muted hover:text-text active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <input
        type="number"
        value={ing.quantity}
        onChange={(e) => onSet("quantity", e.target.value)}
        placeholder="Qty"
        min="0"
        step="any"
        className="w-16 flex-shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight"
      />
      <input
        type="text"
        value={ing.unit}
        onChange={(e) => onSet("unit", e.target.value)}
        placeholder="Unit"
        className="w-20 flex-shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight"
      />
      <input
        type="text"
        value={ing.name}
        onChange={(e) => onSet("name", e.target.value)}
        placeholder="Name *"
        className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight"
      />
      <input
        type="text"
        value={ing.preparation}
        onChange={(e) => onSet("preparation", e.target.value)}
        placeholder="Prep"
        className="w-24 flex-shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight"
      />
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-1.5 flex-shrink-0 text-muted hover:text-destructive"
          aria-label="Remove ingredient"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function SortableGroup({
  gi,
  group,
  showHeader,
  onNameChange,
  onRemoveGroup,
  onAddIngredient,
  onSetIngredient,
  onRemoveIngredient,
}: {
  gi: number;
  group: EditGroup;
  showHeader: boolean;
  onNameChange: (v: string) => void;
  onRemoveGroup: () => void;
  onAddIngredient: () => void;
  onSetIngredient: (ii: number, field: keyof EditIngredient, val: string | boolean) => void;
  onRemoveIngredient: (ii: number) => void;
}) {
  const groupId = `group-${gi}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: groupId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const ingredientIds = group.ingredients.map((_, ii) => `group-${gi}-ing-${ii}`);

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
      {showHeader && (
        <div className="flex items-center gap-2">
          {/* Group drag handle */}
          <button
            type="button"
            className="flex-shrink-0 cursor-grab touch-none text-muted hover:text-text active:cursor-grabbing"
            aria-label="Drag to reorder group"
            {...attributes}
            {...listeners}
          >
            <GripIcon />
          </button>
          <input
            type="text"
            value={group.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Group name"
            className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight"
          />
          <button type="button" onClick={onRemoveGroup} className="text-xs text-muted hover:text-destructive">
            Remove group
          </button>
        </div>
      )}

      <SortableContext items={ingredientIds} strategy={verticalListSortingStrategy}>
        {group.ingredients.map((ing, ii) => (
          <SortableIngredientRow
            key={`group-${gi}-ing-${ii}`}
            id={`group-${gi}-ing-${ii}`}
            ing={ing}
            canRemove={group.ingredients.length > 1}
            onSet={(field, val) => onSetIngredient(ii, field, val)}
            onRemove={() => onRemoveIngredient(ii)}
          />
        ))}
      </SortableContext>

      <button type="button" onClick={onAddIngredient} className="text-xs text-highlight hover:opacity-80">
        + Add ingredient
      </button>
    </div>
  );
}

function EditMode({
  recipe,
  onSaved,
}: {
  recipe: SerializedRecipeWithRelations;
  onSaved: (updated: SerializedRecipeWithRelations) => void;
}) {
  const [form, setForm] = useState<EditState>(() => initEditState(recipe));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const isGroup = (id: string) => id.startsWith("group-") && !id.includes("-ing-");
    const isIng = (id: string) => id.includes("-ing-");

    if (isGroup(activeId) && isGroup(overId)) {
      // Reorder groups
      const fromGi = parseInt(activeId.replace("group-", ""));
      const toGi = parseInt(overId.replace("group-", ""));
      setForm((prev) => {
        const groups = [...prev.groups];
        const [moved] = groups.splice(fromGi, 1);
        groups.splice(toGi, 0, moved);
        return { ...prev, groups };
      });
      return;
    }

    if (isIng(activeId)) {
      // Parse ids: "group-{gi}-ing-{ii}"
      const parseIng = (id: string) => {
        const m = id.match(/^group-(\d+)-ing-(\d+)$/);
        return m ? { gi: parseInt(m[1]), ii: parseInt(m[2]) } : null;
      };
      const src = parseIng(activeId);
      if (!src) return;

      let dstGi: number;
      let dstIi: number;

      if (isGroup(overId)) {
        // Dropped on a group header → move to first position in that group
        dstGi = parseInt(overId.replace("group-", ""));
        dstIi = 0;
      } else {
        const dst = parseIng(overId);
        if (!dst) return;
        dstGi = dst.gi;
        dstIi = dst.ii;
      }

      if (src.gi === dstGi && src.ii === dstIi) return;

      setForm((prev) => {
        const groups = prev.groups.map((g) => ({ ...g, ingredients: [...g.ingredients] }));
        const ingredient = groups[src.gi].ingredients[src.ii];
        groups[src.gi].ingredients.splice(src.ii, 1);
        // Adjust index if same group and source was before destination
        const adjustedDstIi = src.gi === dstGi && src.ii < dstIi ? dstIi - 1 : dstIi;
        groups[dstGi].ingredients.splice(adjustedDstIi, 0, ingredient);
        return { ...prev, groups };
      });
    }
  }

  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setPhotoLoading(true);
    try {
      const dataUrl = await resizeImage(file);
      setField("photoUrl", dataUrl);
    } catch {
      // silently ignore resize errors
    } finally {
      setPhotoLoading(false);
    }
  }

  function setField<K extends keyof EditState>(key: K, val: EditState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function setIngredient(gi: number, ii: number, field: keyof EditIngredient, val: string | boolean) {
    setForm((prev) => ({
      ...prev,
      groups: prev.groups.map((g, gIdx) =>
        gIdx !== gi ? g : {
          ...g,
          ingredients: g.ingredients.map((ing, iIdx) =>
            iIdx !== ii ? ing : { ...ing, [field]: val }
          ),
        }
      ),
    }));
  }

  function addIngredient(gi: number) {
    setForm((prev) => ({
      ...prev,
      groups: prev.groups.map((g, gIdx) =>
        gIdx !== gi ? g : { ...g, ingredients: [...g.ingredients, { name: "", quantity: "", unit: "", preparation: "", isOptional: false }] }
      ),
    }));
  }

  function removeIngredient(gi: number, ii: number) {
    setForm((prev) => ({
      ...prev,
      groups: prev.groups.map((g, gIdx) =>
        gIdx !== gi ? g : { ...g, ingredients: g.ingredients.filter((_, iIdx) => iIdx !== ii) }
      ),
    }));
  }

  function setGroupName(gi: number, val: string) {
    setForm((prev) => ({
      ...prev,
      groups: prev.groups.map((g, gIdx) => (gIdx !== gi ? g : { ...g, name: val })),
    }));
  }

  function addGroup() {
    setForm((prev) => ({
      ...prev,
      groups: [...prev.groups, { name: "", ingredients: [{ name: "", quantity: "", unit: "", preparation: "", isOptional: false }] }],
    }));
  }

  function removeGroup(gi: number) {
    setForm((prev) => ({ ...prev, groups: prev.groups.filter((_, gIdx) => gIdx !== gi) }));
  }

  function setStep(si: number, field: keyof EditStep, val: string) {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((s, sIdx) => (sIdx !== si ? s : { ...s, [field]: val })),
    }));
  }

  function addStep() {
    setForm((prev) => ({ ...prev, steps: [...prev.steps, { body: "", sectionHeader: "" }] }));
  }

  function removeStep(si: number) {
    setForm((prev) => ({ ...prev, steps: prev.steps.filter((_, sIdx) => sIdx !== si) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPatchPayload(form)),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save"); return; }
      onSaved(JSON.parse(JSON.stringify(json.data)) as SerializedRecipeWithRelations);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Core fields */}
      <div className="space-y-4">
        <Input id="edit-title" label="Title *" value={form.title} onChange={(e) => setField("title", e.target.value)} />
        <div>
          <label htmlFor="edit-desc" className="mb-1 block text-sm font-medium text-text">Description</label>
          <textarea
            id="edit-desc"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
          />
        </div>
        {/* Photo */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text">Photo</label>
          {form.photoUrl ? (
            <div className="relative overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.photoUrl}
                alt="Recipe preview"
                className="w-full object-cover"
                style={{ maxHeight: "200px" }}
              />
              <button
                type="button"
                onClick={() => setField("photoUrl", null)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                aria-label="Remove photo"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-4 py-5 text-center transition-colors hover:border-highlight/50 hover:bg-card-hover">
              {photoLoading ? (
                <span className="text-sm text-muted">Processing…</span>
              ) : (
                <>
                  <svg className="h-7 w-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm text-muted">Click to upload a photo</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await handlePhotoFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input id="edit-cuisine" label="Cuisine" value={form.cuisine} onChange={(e) => setField("cuisine", e.target.value)} />
          <Input id="edit-dish-type" label="Dish Type" value={form.dishType} onChange={(e) => setField("dishType", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input id="edit-prep" label="Prep (min)" type="number" min="0" value={form.prepTimeMinutes} onChange={(e) => setField("prepTimeMinutes", e.target.value)} />
          <Input id="edit-cook" label="Cook (min)" type="number" min="0" value={form.cookTimeMinutes} onChange={(e) => setField("cookTimeMinutes", e.target.value)} />
          <Input id="edit-servings" label="Servings" type="number" min="1" value={form.servings} onChange={(e) => setField("servings", e.target.value)} />
        </div>
        <div>
          <label htmlFor="edit-complexity" className="mb-1 block text-sm font-medium text-text">Complexity</label>
          <select
            id="edit-complexity"
            value={form.complexity}
            onChange={(e) => setField("complexity", e.target.value as EditState["complexity"])}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20"
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
      </div>

      {/* Ingredients — DnD enabled */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text">Ingredients</p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={form.groups.map((_, gi) => `group-${gi}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {form.groups.map((group, gi) => (
                <SortableGroup
                  key={`group-${gi}`}
                  gi={gi}
                  group={group}
                  showHeader={form.groups.length > 1}
                  onNameChange={(v) => setGroupName(gi, v)}
                  onRemoveGroup={() => removeGroup(gi)}
                  onAddIngredient={() => addIngredient(gi)}
                  onSetIngredient={(ii, field, val) => setIngredient(gi, ii, field, val)}
                  onRemoveIngredient={(ii) => removeIngredient(gi, ii)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId && (
              <div className="rounded-lg border border-highlight/40 bg-card px-3 py-2 text-sm text-text opacity-80 shadow-lg">
                Dragging…
              </div>
            )}
          </DragOverlay>
        </DndContext>
        <button type="button" onClick={addGroup} className="mt-2 text-xs text-muted hover:text-text">+ Add ingredient group</button>
      </div>

      {/* Steps */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text">Steps</p>
        <div className="space-y-2">
          {form.steps.map((step, si) => (
            <div key={si} className="flex gap-2 items-start">
              <span className="mt-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-highlight text-xs font-bold text-brand-white">{si + 1}</span>
              <div className="flex-1 space-y-1">
                <input
                  type="text"
                  value={step.sectionHeader}
                  onChange={(e) => setStep(si, "sectionHeader", e.target.value)}
                  placeholder="Section header (optional)"
                  className="w-full rounded-lg border border-border bg-card px-2 py-1 text-xs text-text outline-none placeholder:text-muted focus:border-highlight"
                />
                <textarea
                  value={step.body}
                  onChange={(e) => setStep(si, "body", e.target.value)}
                  placeholder={`Step ${si + 1}…`}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
                />
              </div>
              {form.steps.length > 1 && (
                <button type="button" onClick={() => removeStep(si)} className="mt-2 flex-shrink-0 text-muted hover:text-destructive" aria-label="Remove step">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addStep} className="mt-2 text-xs text-highlight hover:opacity-80">+ Add step</button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = { recipe: SerializedRecipeWithRelations };

export function RecipeDetailView({ recipe: initialRecipe }: Props) {
  const router = useRouter();
  const [recipe, setRecipe] = useState(initialRecipe);
  const [mode, setMode] = useState<RecipeMode>("view");
  const [isFavorite, setIsFavorite] = useState(recipe.isFavorite);
  const [togglingFav, setTogglingFav] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Shared servings scaler — persists across View / Price Calculator tab switches.
  // Resets automatically whenever the base servings change (i.e. after an edit + save).
  const [currentServings, setCurrentServings] = useState(recipe.servings);
  useEffect(() => {
    setCurrentServings(recipe.servings);
  }, [recipe.servings]);

  const totalTime = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0) || null;

  async function toggleFavorite() {
    if (togglingFav) return;
    setTogglingFav(true);
    const prev = isFavorite;
    setIsFavorite(!isFavorite);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/favorite`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) { setIsFavorite(prev); return; }
      setIsFavorite(json.data?.isFavorite ?? !prev);
    } catch {
      setIsFavorite(prev);
    } finally {
      setTogglingFav(false);
    }
  }

  async function deleteRecipe() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
      if (res.ok) router.push("/recipes");
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const TABS: { id: RecipeMode; label: string }[] = [
    { id: "view", label: "View" },
    { id: "edit", label: "Edit" },
    { id: "list", label: "Shopping List" },
    { id: "shopping", label: "Price Calculator" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back navigation */}
      <Link href="/recipes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Recipe Bank
      </Link>

      {/* Photo */}
      {recipe.photoUrl && (
        <div className="overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recipe.photoUrl}
            alt={recipe.title}
            className="w-full object-cover"
            style={{ maxHeight: "420px" }}
          />
        </div>
      )}

      {/* Header: title + actions */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-text leading-tight">{recipe.title}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Favorite */}
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={togglingFav}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-card-hover disabled:cursor-not-allowed"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill={isFavorite ? "#ff3131" : "none"}
              stroke={isFavorite ? "#ff3131" : "currentColor"}
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Time summary */}
      {totalTime && (
        <p className="text-sm text-muted flex items-center gap-1">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {formatTime(totalTime)} total
          {recipe.prepTimeMinutes && ` · ${formatTime(recipe.prepTimeMinutes)} prep`}
          {recipe.cookTimeMinutes && ` · ${formatTime(recipe.cookTimeMinutes)} cook`}
        </p>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              mode === tab.id
                ? "bg-highlight text-brand-white"
                : "text-muted hover:bg-card-hover hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mode content */}
      <div role="tabpanel">
        {mode === "view" && (
          <ViewMode
            recipe={recipe}
            currentServings={currentServings}
            baseServings={recipe.servings}
            onServingsChange={setCurrentServings}
          />
        )}
        {mode === "edit" && (
          <EditMode
            recipe={recipe}
            onSaved={(updated) => {
              setRecipe(updated);
              setIsFavorite(updated.isFavorite);
              setMode("view");
            }}
          />
        )}
        {mode === "list" && <ShoppingListMode recipe={recipe} />}
        {mode === "shopping" && (
          <PriceCalculatorMode
            recipe={recipe}
            currentServings={currentServings}
            baseServings={recipe.servings}
            onServingsChange={setCurrentServings}
          />
        )}
      </div>

      {/* Notes + Cook Log (always shown in view mode) */}
      {mode === "view" && (
        <div className="space-y-8 border-t border-border pt-6">
          <RecipeNotesSection recipeId={recipe.id} />
          <RecipeCookLogSection recipeId={recipe.id} />

          {/* Delete */}
          <div className="border-t border-border pt-6">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-muted transition-colors hover:text-destructive"
              >
                Delete recipe
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-text">Delete this recipe permanently?</p>
                <Button
                  type="button"
                  variant="primary"
                  onClick={deleteRecipe}
                  disabled={deleting}
                  className="bg-destructive hover:opacity-90 text-brand-white"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
