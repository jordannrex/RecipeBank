"use client";

import { useEffect, useRef, useState } from "react";

/** Auto-grow a textarea to fit its content. */
function growTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
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
import { QtyUnit } from "@/components/ui/fraction-display";
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
  _key: string;
  name: string;
  quantity: string;
  unit: string;
  preparation: string;
  isOptional: boolean;
};

type EditGroup = {
  _key: string;
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
  sourceUrl: string;
  cuisine: string;
  dishType: string;
  complexity: "EASY" | "MEDIUM" | "HARD" | "NONE";
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
    sourceUrl: r.sourceUrl ?? "",
    cuisine: r.cuisine ?? "",
    dishType: r.dishType ?? "",
    complexity: r.complexity,
    prepTimeMinutes: r.prepTimeMinutes?.toString() ?? "",
    cookTimeMinutes: r.cookTimeMinutes?.toString() ?? "",
    servings: r.servings.toString(),
    photoUrl: r.photoUrl ?? null,
    groups: r.ingredientGroups.length > 0
      ? r.ingredientGroups.map((g) => ({
          _key: crypto.randomUUID(),
          name: g.name,
          ingredients: g.ingredients.length > 0
            ? g.ingredients.map((i) => ({
                _key: crypto.randomUUID(),
                name: i.name,
                quantity: i.quantity?.toString() ?? "",
                unit: i.unit ?? "",
                preparation: i.preparation ?? "",
                isOptional: i.isOptional,
              }))
            : [{ _key: crypto.randomUUID(), name: "", quantity: "", unit: "", preparation: "", isOptional: false }],
        }))
      : [{ _key: crypto.randomUUID(), name: "", ingredients: [{ _key: crypto.randomUUID(), name: "", quantity: "", unit: "", preparation: "", isOptional: false }] }],
    steps: r.steps.length > 0
      ? r.steps.map((s) => ({ body: s.body, sectionHeader: s.sectionHeader ?? "" }))
      : [{ body: "", sectionHeader: "" }],
  };
}

function buildPatchPayload(edit: EditState) {
  const sourceUrl = edit.sourceUrl.trim();
  return {
    title: edit.title.trim(),
    description: edit.description.trim() || null,
    sourceUrl: sourceUrl || null,
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
        {!!recipe.prepTimeMinutes && (
          <MetaChip
            icon={<span className="text-[10px]">prep</span>}
            label={formatTime(recipe.prepTimeMinutes)}
          />
        )}
        {!!recipe.cookTimeMinutes && (
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
        {recipe.complexity !== "NONE" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted">
            <span
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: complexityDot[recipe.complexity] ?? "#71717a" }}
            />
            {complexityLabel[recipe.complexity] ?? recipe.complexity}
          </span>
        )}
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
          <div className="space-y-5">
            {recipe.ingredientGroups.map((group) => (
              <div key={group.id}>
                {group.name && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{group.name}</p>
                )}
                <ul className="divide-y divide-border">
                  {group.ingredients.map((ing) => {
                    const scaledQty = scaleQty(ing.quantity, scale);
                    const qtyNum = scaledQty ? parseFloat(scaledQty) : null;
                    return (
                      <li key={ing.id} className="flex items-center justify-between gap-4 py-3">
                        <span className={cn("text-sm", ing.isOptional ? "text-muted" : "text-text")}>
                          {ing.name}
                          {ing.preparation && <span className="ml-1 text-xs text-muted">({ing.preparation})</span>}
                          {ing.isOptional && <span className="ml-1.5 text-xs text-muted italic">optional</span>}
                        </span>
                        {(qtyNum != null || ing.unit) && (
                          <QtyUnit
                            quantity={qtyNum}
                            unit={ing.unit}
                            className="flex-shrink-0 text-sm font-semibold text-text"
                          />
                        )}
                      </li>
                    );
                  })}
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

function ShoppingListMode({
  recipe,
  refreshKey,
}: {
  recipe: SerializedRecipeWithRelations;
  refreshKey: number;
}) {
  const baseServings = recipe.servings;
  const [servings, setServings] = useState(recipe.currentServings);
  const scale = baseServings > 0 ? servings / baseServings : 1;

  // needIt maps both ingredientId AND a normalized-name key → shopping item id,
  // so an ingredient counts as "on the list" by either match.
  const nameKey = (name: string) => `n:${name.trim().toLowerCase()}`;
  const [needIt, setNeedIt] = useState<Map<string, string>>(new Map());
  // checkedSet holds the shopping item ids that are checked (bought) on the
  // Shopping List page. Checked items remain in needIt (still in the list DB row)
  // but should appear in "Have It" here, mirroring the Shopping List's state.
  const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set());
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

  // Re-fetch whenever the recipe changes or the parent signals a refresh
  useEffect(() => {
    let cancelled = false;
    setLoadingState("loading");
    async function load() {
      try {
        const res = await fetch(`/api/shopping/items?recipeId=${recipe.id}`);
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        if (cancelled) return;
        // Key the lookup by BOTH ingredientId and normalized name → shopping item
        // id. Name matching keeps the recipe tab in sync even when a past recipe
        // edit nulled the ingredientId on existing shopping items.
        const map = new Map<string, string>();
        const checked = new Set<string>();
        for (const item of json.data.items as { id: string; ingredientId: string | null; name: string; isChecked: boolean }[]) {
          if (item.ingredientId) map.set(item.ingredientId, item.id);
          map.set(nameKey(item.name), item.id);
          if (item.isChecked) checked.add(item.id);
        }
        setNeedIt(map);
        setCheckedSet(checked);
        setLoadingState("ready");
      } catch {
        if (!cancelled) setLoadingState("error");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [recipe.id, refreshKey]);

  function scaledQty(raw: string | null): number | null {
    if (!raw) return null;
    const n = parseFloat(raw);
    if (isNaN(n)) return null;
    return parseFloat((n * scale).toPrecision(4));
  }

  async function toggle(ingredientId: string, name: string, rawQty: string | null, unit: string | null) {
    if (toggling.has(ingredientId)) return;
    setToggling((prev) => new Set(prev).add(ingredientId));
    // Match by id first, then by name (covers items orphaned by past edits).
    const existingId = needIt.get(ingredientId) ?? needIt.get(nameKey(name));
    try {
      if (existingId) {
        if (checkedSet.has(existingId)) {
          // Item is in the list but marked as bought on the Shopping List page.
          // Clicking it here means "I actually still need this" → uncheck it
          // (PATCH with no body toggles isChecked), moving it back to Need to Buy.
          const res = await fetch(`/api/shopping/items/${existingId}`, { method: "PATCH" });
          if (res.ok) {
            setCheckedSet((prev) => {
              const s = new Set(prev);
              s.delete(existingId);
              return s;
            });
          }
        } else {
          // Item is in the list and unchecked. Clicking means "I don't need this
          // anymore" → delete it entirely, moving it to Have It.
          const res = await fetch(`/api/shopping/items/${existingId}`, { method: "DELETE" });
          if (res.ok) {
            setNeedIt((prev) => {
              const m = new Map(prev);
              m.delete(ingredientId);
              m.delete(nameKey(name));
              return m;
            });
            // Also remove from checkedSet in case it was there (defensive).
            setCheckedSet((prev) => { const s = new Set(prev); s.delete(existingId); return s; });
          }
        }
      } else {
        // Not in list. Add it.
        const res = await fetch("/api/shopping/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipeId: recipe.id,
            recipeName: recipe.title,
            ingredientId,
            name,
            quantity: scaledQty(rawQty),
            unit: unit ?? null,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setNeedIt((prev) => {
            const m = new Map(prev);
            m.set(ingredientId, json.data.id);
            m.set(nameKey(name), json.data.id);
            return m;
          });
          // New items start unchecked — no change to checkedSet.
        }
      }
    } finally {
      setToggling((prev) => { const s = new Set(prev); s.delete(ingredientId); return s; });
    }
  }

  if (loadingState === "loading") {
    return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  }

  const inList    = (i: { id: string; name: string }) => needIt.has(i.id) || needIt.has(nameKey(i.name));
  const getShopId = (i: { id: string; name: string }) => needIt.get(i.id) ?? needIt.get(nameKey(i.name));
  // isGotIt: item is in the list but already checked off on the Shopping List page.
  const isGotIt   = (i: { id: string; name: string }) => { const sid = getShopId(i); return !!sid && checkedSet.has(sid); };
  // "Need to Buy" = in list AND not yet checked. "Have It" = not in list OR already got it.
  const needToBuy = allIngredients.filter((i) => inList(i) && !isGotIt(i));
  const haveIt    = allIngredients.filter((i) => !inList(i) || isGotIt(i));
  const isScaled  = servings !== baseServings;

  return (
    <div className="space-y-5">
      {/* Servings scaler */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Mark ingredients you still need to buy.
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <button
            type="button"
            onClick={() => setServings((v) => Math.max(1, v - 1))}
            className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-card-hover hover:text-text"
            aria-label="Decrease servings"
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M2 5h6"/></svg>
          </button>
          <span className={cn("min-w-[1.25rem] text-center font-semibold", isScaled ? "text-highlight" : "text-text")}>
            {servings}
          </span>
          <button
            type="button"
            onClick={() => setServings((v) => Math.min(100, v + 1))}
            className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-card-hover hover:text-text"
            aria-label="Increase servings"
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 2v6M2 5h6"/></svg>
          </button>
          <span>servings</span>
          {isScaled && (
            <button
              type="button"
              onClick={() => setServings(baseServings)}
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
      </div>

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
                  <QtyUnit quantity={scaledQty(item.quantity)} unit={item.unit} className="text-sm text-text/60" />
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
            {haveIt.map((item) => {
              const gotIt = isGotIt(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={toggling.has(item.id)}
                    onClick={() => toggle(item.id, item.name, item.quantity, item.unit)}
                    className="flex w-full items-center gap-3 border-b border-border/50 px-1 py-3 text-left transition-colors last:border-b-0 hover:bg-card-hover disabled:opacity-60"
                  >
                    {gotIt ? (
                      // Checked on Shopping List page — dimmed checkmark.
                      // Clicking restores it to "Need to Buy".
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-highlight/40 bg-highlight/15">
                        <svg className="h-3 w-3 text-highlight/60" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      </span>
                    ) : (
                      // Not in list — empty checkbox. Clicking adds to list.
                      <span className="h-5 w-5 shrink-0 rounded border-2 border-border/60" />
                    )}
                    <span className={cn("flex-1 text-sm", gotIt ? "text-text/40 line-through" : "text-text/70")}>
                      {item.name}
                    </span>
                    <QtyUnit quantity={scaledQty(item.quantity) !== null ? String(scaledQty(item.quantity)) : null} unit={item.unit} className={cn("text-sm", gotIt ? "text-text/30" : "text-text/40")} />
                  </button>
                </li>
              );
            })}
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
      storePkgQty:  i.storePkgQty,
      storePkgUnit: i.storePkgUnit,
      price:        i.price,
    }))
  );

  const scale = baseServings > 0 ? currentServings / baseServings : 1;

  // Seed rows from persisted ingredient price data
  const [rows, setRows] = useState<Record<string, PriceRow>>(() =>
    Object.fromEntries(
      allIngredients.map((i) => [
        i.id,
        {
          storePkgQty:  i.storePkgQty  ?? "",
          storePkgUnit: i.storePkgUnit ?? i.unit ?? "",
          price:        i.price        ?? "",
        },
      ])
    )
  );

  // Debounce timer refs keyed by ingredient id
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function setField(id: string, field: keyof PriceRow, val: string) {
    setRows((prev) => {
      const next = { ...prev, [id]: { ...prev[id], [field]: val } };
      return next;
    });
    // Debounced save — 700ms after last keystroke per ingredient
    const existing = saveTimers.current.get(id);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(
      id,
      setTimeout(() => {
        saveTimers.current.delete(id);
        setRows((current) => {
          const row = current[id];
          if (!row) return current;
          fetch(`/api/ingredients/${id}/price`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              storePkgQty:  row.storePkgQty  ? parseFloat(row.storePkgQty)  : null,
              storePkgUnit: row.storePkgUnit || null,
              price:        row.price        ? parseFloat(row.price)        : null,
            }),
          }).catch(console.error);
          return current;
        });
      }, 700),
    );
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
            const recipeLabel = sq ? parseFloat(sq) : null;
            return (
              <div
                key={ing.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-border/60 px-4 py-3 last:border-b-0"
              >
                {/* Ingredient */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{ing.name}</p>
                  {(recipeLabel != null || ing.unit) && (
                    <p className="text-xs text-muted">
                      Recipe: <QtyUnit quantity={recipeLabel} unit={ing.unit} />
                    </p>
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
  selected,
  onSet,
  onRemove,
  onToggleSelect,
}: {
  id: string;
  ing: EditIngredient;
  canRemove: boolean;
  selected: boolean;
  onSet: (field: keyof EditIngredient, val: string | boolean) => void;
  onRemove: () => void;
  onToggleSelect: (shiftHeld: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex gap-2 items-start rounded-lg px-1 transition-colors",
        selected && "bg-highlight/10 ring-1 ring-inset ring-highlight/30",
      )}
    >
      {/* Select circle */}
      <button
        type="button"
        onClick={(e) => onToggleSelect(e.shiftKey)}
        aria-label={selected ? "Deselect" : "Select ingredient"}
        aria-pressed={selected}
        className={cn(
          "mt-2.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 transition-colors",
          selected ? "border-highlight bg-highlight" : "border-border bg-transparent hover:border-highlight/60",
        )}
      />
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
  group,
  showHeader,
  selectedIngIds,
  onNameChange,
  onRemoveGroup,
  onAddIngredient,
  onSetIngredient,
  onRemoveIngredient,
  onToggleIngredientSelect,
}: {
  gi: number;
  group: EditGroup;
  showHeader: boolean;
  selectedIngIds: Set<string>;
  onNameChange: (v: string) => void;
  onRemoveGroup: () => void;
  onAddIngredient: () => void;
  onSetIngredient: (ii: number, field: keyof EditIngredient, val: string | boolean) => void;
  onRemoveIngredient: (ii: number) => void;
  onToggleIngredientSelect: (ingId: string, shiftHeld: boolean) => void;
}) {
  // Use group._key as the stable DnD ID
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group._key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const ingredientIds = group.ingredients.map((i) => `${group._key}::${i._key}`);

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
      {showHeader && (
        <div className="flex items-center gap-2">
          {/* Group drag handle — only this element triggers group drag */}
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
        {group.ingredients.map((ing, ii) => {
          const ingId = `${group._key}::${ing._key}`;
          return (
            <SortableIngredientRow
              key={ingId}
              id={ingId}
              ing={ing}
              canRemove={group.ingredients.length > 1}
              selected={selectedIngIds.has(ingId)}
              onSet={(field, val) => onSetIngredient(ii, field, val)}
              onRemove={() => onRemoveIngredient(ii)}
              onToggleSelect={(shiftHeld) => onToggleIngredientSelect(ingId, shiftHeld)}
            />
          );
        })}
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
  const [suggestedFields, setSuggestedFields] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [selectedIngIds, setSelectedIngIds] = useState<Set<string>>(new Set());
  const lastSelectedIngRef = useRef<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  // DnD IDs: group._key (no "::") for groups; "${group._key}::${ing._key}" for ingredients
  const isGroupDndId = (id: string) => !id.includes("::");
  const isIngDndId   = (id: string) =>  id.includes("::");

  function findGroupIdx(key: string) {
    return form.groups.findIndex((g) => g._key === key);
  }
  function findIngIdx(id: string) {
    const sep = id.indexOf("::");
    if (sep === -1) return null;
    const gKey = id.slice(0, sep);
    const iKey = id.slice(sep + 2);
    const gi = form.groups.findIndex((g) => g._key === gKey);
    if (gi === -1) return null;
    const ii = form.groups[gi].ingredients.findIndex((i) => i._key === iKey);
    if (ii === -1) return null;
    return { gi, ii };
  }

  function handleIngredientSelect(ingId: string, shiftHeld: boolean) {
    if (shiftHeld && lastSelectedIngRef.current) {
      const allIds = form.groups.flatMap((g) =>
        g.ingredients.map((i) => `${g._key}::${i._key}`)
      );
      const lastIdx = allIds.indexOf(lastSelectedIngRef.current);
      const thisIdx = allIds.indexOf(ingId);
      if (lastIdx !== -1 && thisIdx !== -1) {
        const [from, to] = lastIdx <= thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
        setSelectedIngIds((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) next.add(allIds[i]);
          return next;
        });
        return; // don't update lastSelected on shift-range
      }
    }
    setSelectedIngIds((prev) => {
      const next = new Set(prev);
      if (next.has(ingId)) next.delete(ingId);
      else next.add(ingId);
      return next;
    });
    lastSelectedIngRef.current = ingId;
  }

  function moveSelectedToGroup(targetGi: number) {
    if (selectedIngIds.size === 0) return;
    const collected: EditIngredient[] = [];
    const clearedGroups = form.groups.map((g) => ({
      ...g,
      ingredients: g.ingredients.filter((i) => {
        if (selectedIngIds.has(`${g._key}::${i._key}`)) { collected.push({ ...i }); return false; }
        return true;
      }),
    }));
    clearedGroups[targetGi] = {
      ...clearedGroups[targetGi],
      ingredients: [...clearedGroups[targetGi].ingredients, ...collected],
    };
    const finalGroups = clearedGroups.map((g) => ({
      ...g,
      ingredients: g.ingredients.length > 0 ? g.ingredients
        : [{ _key: crypto.randomUUID(), name: "", quantity: "", unit: "", preparation: "", isOptional: false }],
    }));
    setForm((prev) => ({ ...prev, groups: finalGroups }));
    setSelectedIngIds(new Set());
    lastSelectedIngRef.current = null;
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId   = over.id   as string;

    // ── Group reorder ────────────────────────────────────────────────────────
    if (isGroupDndId(activeId) && isGroupDndId(overId)) {
      const fromGi = findGroupIdx(activeId);
      const toGi   = findGroupIdx(overId);
      if (fromGi === -1 || toGi === -1 || fromGi === toGi) return;
      setForm((prev) => {
        const groups = [...prev.groups];
        const [moved] = groups.splice(fromGi, 1);
        groups.splice(toGi, 0, moved);
        return { ...prev, groups };
      });
      return;
    }

    // ── Ingredient move ──────────────────────────────────────────────────────
    if (isIngDndId(activeId)) {
      const src = findIngIdx(activeId);
      if (!src) return;

      let dstGi: number;
      let dstIi: number;
      if (isGroupDndId(overId)) {
        dstGi = findGroupIdx(overId);
        if (dstGi === -1) return;
        dstIi = 0;
      } else {
        const dst = findIngIdx(overId);
        if (!dst) return;
        dstGi = dst.gi;
        dstIi = dst.ii;
      }

      if (src.gi === dstGi && src.ii === dstIi) return;

      // ── Multi-drag: dragged item is part of a selection ──────────────────
      if (selectedIngIds.has(activeId) && selectedIngIds.size > 1) {
        const collected: EditIngredient[] = [];
        const clearedGroups = form.groups.map((g) => ({
          ...g,
          ingredients: g.ingredients.filter((i) => {
            if (selectedIngIds.has(`${g._key}::${i._key}`)) { collected.push({ ...i }); return false; }
            return true;
          }),
        }));
        const targetIngs = clearedGroups[dstGi].ingredients;
        const insertAt = Math.min(dstIi, targetIngs.length);
        clearedGroups[dstGi] = {
          ...clearedGroups[dstGi],
          ingredients: [
            ...targetIngs.slice(0, insertAt),
            ...collected,
            ...targetIngs.slice(insertAt),
          ],
        };
        const finalGroups = clearedGroups.map((g) => ({
          ...g,
          ingredients: g.ingredients.length > 0 ? g.ingredients
            : [{ _key: crypto.randomUUID(), name: "", quantity: "", unit: "", preparation: "", isOptional: false }],
        }));
        setForm((prev) => ({ ...prev, groups: finalGroups }));
        setSelectedIngIds(new Set());
        lastSelectedIngRef.current = null;
        return;
      }

      // ── Single ingredient drag ───────────────────────────────────────────
      setForm((prev) => {
        const groups = prev.groups.map((g) => ({ ...g, ingredients: [...g.ingredients] }));
        const ingredient = groups[src.gi].ingredients[src.ii];
        groups[src.gi].ingredients.splice(src.ii, 1);
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

  function clearSuggested(field: string) {
    setSuggestedFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function handleSuggestMetadata() {
    const ingredientNames = form.groups
      .flatMap((g) => g.ingredients.map((i) => i.name))
      .filter(Boolean);
    const stepBodies = form.steps.map((s) => s.body).filter(Boolean);

    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/recipes/suggest-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          ingredients: ingredientNames,
          steps: stepBodies,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSuggestError(json.error ?? "Couldn't generate suggestions.");
        return;
      }
      const s = json.data as {
        cuisine: string | null;
        dishType: string | null;
        complexity: "EASY" | "MEDIUM" | "HARD" | null;
        prepTimeMinutes: number | null;
        cookTimeMinutes: number | null;
        description: string | null;
      };

      // Only fill fields the user has left empty — already-filled fields stay
      // untouched (and gray). Filled-in fields turn brand-red to flag that the
      // value came from the AI. Complexity counts as "empty" only when it is
      // NONE (the unset default); an existing EASY/MEDIUM/HARD is left alone.
      const newSuggested = new Set<string>();
      const nextForm = { ...form };
      if (s.cuisine        && !form.cuisine.trim())         { nextForm.cuisine = s.cuisine;                        newSuggested.add("cuisine"); }
      if (s.dishType       && !form.dishType.trim())        { nextForm.dishType = s.dishType;                      newSuggested.add("dishType"); }
      if (s.complexity     && form.complexity === "NONE")   { nextForm.complexity = s.complexity;                  newSuggested.add("complexity"); }
      if (s.prepTimeMinutes && !form.prepTimeMinutes.trim()) { nextForm.prepTimeMinutes = String(s.prepTimeMinutes); newSuggested.add("prepTimeMinutes"); }
      if (s.cookTimeMinutes && !form.cookTimeMinutes.trim()) { nextForm.cookTimeMinutes = String(s.cookTimeMinutes); newSuggested.add("cookTimeMinutes"); }
      if (s.description    && !form.description.trim())     { nextForm.description = s.description;                newSuggested.add("description"); }

      if (newSuggested.size === 0) {
        setSuggestError("Everything's already filled in — nothing to suggest.");
      } else {
        setForm(nextForm);
        setSuggestedFields(newSuggested);
      }
    } catch {
      setSuggestError("Network error — please try again.");
    } finally {
      setSuggesting(false);
    }
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
        gIdx !== gi ? g : { ...g, ingredients: [...g.ingredients, { _key: crypto.randomUUID(), name: "", quantity: "", unit: "", preparation: "", isOptional: false }] }
      ),
    }));
  }

  function removeIngredient(gi: number, ii: number) {
    const ingId = `${form.groups[gi]._key}::${form.groups[gi].ingredients[ii]._key}`;
    setSelectedIngIds((prev) => {
      if (!prev.has(ingId)) return prev;
      const next = new Set(prev); next.delete(ingId); return next;
    });
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
      groups: [...prev.groups, { _key: crypto.randomUUID(), name: "", ingredients: [{ _key: crypto.randomUUID(), name: "", quantity: "", unit: "", preparation: "", isOptional: false }] }],
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
      setSuggestedFields(new Set());
      setSelectedIngIds(new Set());
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
            onChange={(e) => { setField("description", e.target.value); clearSuggested("description"); growTextarea(e.target); }}
            ref={growTextarea}
            rows={2}
            className={cn(
              "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none overflow-hidden",
              suggestedFields.has("description") ? "text-brand-red" : "text-text",
            )}
          />
        </div>
        {/* Source URL */}
        <div>
          <label htmlFor="edit-source-url" className="mb-1 block text-sm font-medium text-text">Source URL</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </span>
            <input
              id="edit-source-url"
              type="url"
              value={form.sourceUrl}
              onChange={(e) => setField("sourceUrl", e.target.value)}
              placeholder="https://www.example.com/recipe/…"
              className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20"
            />
          </div>
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
          <Input
            id="edit-cuisine" label="Cuisine" value={form.cuisine}
            className={suggestedFields.has("cuisine") ? "text-brand-red" : undefined}
            onChange={(e) => { setField("cuisine", e.target.value); clearSuggested("cuisine"); }}
          />
          <Input
            id="edit-dish-type" label="Dish Type" value={form.dishType}
            className={suggestedFields.has("dishType") ? "text-brand-red" : undefined}
            onChange={(e) => { setField("dishType", e.target.value); clearSuggested("dishType"); }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input
            id="edit-prep" label="Prep (min)" type="number" min="0" value={form.prepTimeMinutes}
            className={suggestedFields.has("prepTimeMinutes") ? "text-brand-red" : undefined}
            onChange={(e) => { setField("prepTimeMinutes", e.target.value); clearSuggested("prepTimeMinutes"); }}
          />
          <Input
            id="edit-cook" label="Cook (min)" type="number" min="0" value={form.cookTimeMinutes}
            className={suggestedFields.has("cookTimeMinutes") ? "text-brand-red" : undefined}
            onChange={(e) => { setField("cookTimeMinutes", e.target.value); clearSuggested("cookTimeMinutes"); }}
          />
          <Input id="edit-servings" label="Servings" type="number" min="1" value={form.servings} onChange={(e) => setField("servings", e.target.value)} />
        </div>
        <div>
          <label htmlFor="edit-complexity" className="mb-1 block text-sm font-medium text-text">Complexity</label>
          <select
            id="edit-complexity"
            value={form.complexity}
            onChange={(e) => { setField("complexity", e.target.value as EditState["complexity"]); clearSuggested("complexity"); }}
            className={cn(
              "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20",
              suggestedFields.has("complexity") ? "text-brand-red" : "text-text",
            )}
          >
            <option value="NONE">None</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>

        {/* Suggest Metadata */}
        <button
          type="button"
          onClick={handleSuggestMetadata}
          disabled={!form.title.trim() || suggesting}
          className="flex items-center gap-1.5 self-start rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-highlight/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          {suggesting ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Suggesting…
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
              </svg>
              Suggest Metadata
            </>
          )}
        </button>
        {suggestError && (
          <p className="text-xs text-destructive">{suggestError}</p>
        )}
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
          {/* Multi-select action bar */}
          {selectedIngIds.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-highlight/30 bg-highlight/5 px-3 py-2 text-sm">
              <span className="font-medium text-text">{selectedIngIds.size} selected</span>
              {form.groups.length > 1 && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-muted">Move to:</span>
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value !== "") moveSelectedToGroup(parseInt(e.target.value)); }}
                    className="rounded-lg border border-border bg-card px-2 py-0.5 text-sm text-text outline-none focus:border-highlight"
                  >
                    <option value="" disabled>Pick group…</option>
                    {form.groups.map((g, gi) => (
                      <option key={g._key} value={gi}>{g.name || `Group ${gi + 1}`}</option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                onClick={() => { setSelectedIngIds(new Set()); lastSelectedIngRef.current = null; }}
                className="ml-auto text-xs text-muted hover:text-text"
              >
                Clear
              </button>
            </div>
          )}

          <SortableContext
            items={form.groups.map((g) => g._key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {form.groups.map((group, gi) => (
                <SortableGroup
                  key={group._key}
                  gi={gi}
                  group={group}
                  showHeader={form.groups.length > 1}
                  selectedIngIds={selectedIngIds}
                  onNameChange={(v) => setGroupName(gi, v)}
                  onRemoveGroup={() => removeGroup(gi)}
                  onAddIngredient={() => addIngredient(gi)}
                  onSetIngredient={(ii, field, val) => setIngredient(gi, ii, field, val)}
                  onRemoveIngredient={(ii) => removeIngredient(gi, ii)}
                  onToggleIngredientSelect={handleIngredientSelect}
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
                  onChange={(e) => { setStep(si, "body", e.target.value); growTextarea(e.target); }}
                  ref={growTextarea}
                  placeholder={`Step ${si + 1}…`}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none overflow-hidden"
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
// Recipe Edits history section
// ---------------------------------------------------------------------------

type EditRow = {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

function formatFieldName(f: string): string {
  return f
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function truncate(s: string | null, max = 80): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function RecipeEditsSection({ recipeId }: { recipeId: string }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<EditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());

  async function load() {
    if (loaded) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/edits?limit=200`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setEdits(json.data.edits as EditRow[]);
      setLoaded(true);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    setOpen((v) => {
      if (!v) load();
      return !v;
    });
  }

  async function dismiss(editId: string) {
    setDismissing((prev) => new Set(prev).add(editId));
    try {
      await fetch(`/api/recipes/${recipeId}/edits/${editId}`, { method: "DELETE" });
      setEdits((prev) => prev.filter((e) => e.id !== editId));
    } finally {
      setDismissing((prev) => { const s = new Set(prev); s.delete(editId); return s; });
    }
  }

  return (
    <div className="border-t border-border pt-4">
      {/* Header toggle */}
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <svg
          className={cn(
            "h-4 w-4 flex-shrink-0 text-muted transition-transform duration-200",
            open ? "rotate-90" : "rotate-0",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-sm font-semibold text-text">Recipe Edits</span>
      </button>

      {/* Collapsible table */}
      {open && (
        <div className="mt-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Loading…</p>
          ) : error ? (
            <p className="py-4 text-sm text-destructive">{error}</p>
          ) : edits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No edit history yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-x-4 border-b border-border bg-card px-4 py-2.5">
                {["Field", "Before", "After", "Date", ""].map((h, i) => (
                  <span key={i} className="text-xs font-semibold uppercase tracking-wider text-text/50">
                    {h}
                  </span>
                ))}
              </div>

              {/* Rows */}
              {edits.map((edit) => (
                <div
                  key={edit.id}
                  className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-center gap-x-4 border-b border-border/60 px-4 py-3 last:border-b-0"
                >
                  <span className="text-sm font-medium text-text truncate">
                    {formatFieldName(edit.fieldName)}
                  </span>
                  <span className="text-sm text-muted truncate" title={edit.oldValue ?? undefined}>
                    {truncate(edit.oldValue)}
                  </span>
                  <span className="text-sm text-text truncate" title={edit.newValue ?? undefined}>
                    {truncate(edit.newValue)}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {new Date(edit.createdAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => dismiss(edit.id)}
                    disabled={dismissing.has(edit.id)}
                    aria-label="Dismiss this edit"
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-card-hover hover:text-destructive disabled:opacity-40"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
  const [showStickyTitle, setShowStickyTitle] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // "Add to List" button state
  type ListStatus = "checking" | "not-added" | "adding" | "added";
  const [listStatus, setListStatus] = useState<ListStatus>("checking");
  // Increment to force ShoppingListMode to re-fetch after addAllToList
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // On mount, check if this recipe already has items in the shopping list
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shopping/items?recipeId=${recipe.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const items = json.data?.items ?? [];
        setListStatus(items.length > 0 ? "added" : "not-added");
      })
      .catch(() => { if (!cancelled) setListStatus("not-added"); });
    return () => { cancelled = true; };
  }, [recipe.id]);

  async function addAllToList() {
    if (listStatus !== "not-added") return;
    setListStatus("adding");
    const allIngredients = recipe.ingredientGroups.flatMap((g) =>
      g.ingredients.map((i) => ({
        ingredientId: i.id,
        name: i.name,
        quantity: i.quantity ? parseFloat(i.quantity) : null,
        unit: i.unit ?? null,
      }))
    );
    try {
      await Promise.all(
        allIngredients.map((ing) =>
          fetch("/api/shopping/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipeId: recipe.id,
              recipeName: recipe.title,
              ingredientId: ing.ingredientId,
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
            }),
          })
        )
      );
      setListStatus("added");
      // Tell the Shopping List tab to re-fetch so it reflects the newly added items
      setListRefreshKey((k) => k + 1);
    } catch {
      setListStatus("not-added");
    }
  }

  // Sticky title bar — hide/show based on whether the h1 is in viewport
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyTitle(!entry.isIntersecting),
      // rootMargin pushes the threshold down by the nav height (80px) so the bar
      // appears exactly when the title disappears under the nav.
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
    <>
      {/* ── Sticky title bar (appears once the h1 scrolls under the nav) ── */}
      <div
        aria-hidden={!showStickyTitle}
        className={cn(
          "fixed inset-x-0 top-20 z-40 border-b border-border bg-white",
          "transition-[opacity,transform] duration-200 ease-out",
          showStickyTitle ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0 pointer-events-none",
        )}
      >
        <div className="mx-auto flex h-11 max-w-7xl items-center justify-center px-4 sm:px-6 lg:px-8">
          <p className="truncate text-sm font-semibold text-text">{recipe.title}</p>
        </div>
      </div>

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
        <div className="flex flex-col gap-1">
          <h1 ref={titleRef} className="text-2xl font-bold text-text leading-tight">{recipe.title}</h1>
          {recipe.sourceUrl && (() => {
            let display = recipe.sourceUrl;
            try { display = new URL(recipe.sourceUrl).hostname.replace(/^www\./, ""); } catch { /* use raw url */ }
            return (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-medium text-muted">Source:</span>
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-highlight hover:opacity-80 transition-opacity"
                >
                  <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  {display}
                </a>
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Add to List */}
          {listStatus !== "checking" && (
            <button
              type="button"
              onClick={addAllToList}
              disabled={listStatus === "adding" || listStatus === "added"}
              aria-label={listStatus === "added" ? "All ingredients added to shopping list" : "Add all ingredients to shopping list"}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default",
                listStatus === "added"
                  ? "border-highlight/40 bg-highlight/10 text-highlight"
                  : listStatus === "adding"
                    ? "border-border bg-card text-muted"
                    : "border-border bg-card text-text hover:bg-card-hover",
              )}
            >
              {listStatus === "added" ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  In List
                </>
              ) : listStatus === "adding" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Adding…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 01-8 0" />
                  </svg>
                  Add to List
                </>
              )}
            </button>
          )}

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
          {!!recipe.prepTimeMinutes && ` · ${formatTime(recipe.prepTimeMinutes)} prep`}
          {!!recipe.cookTimeMinutes && ` · ${formatTime(recipe.cookTimeMinutes)} cook`}
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
        {mode === "list" && <ShoppingListMode recipe={recipe} refreshKey={listRefreshKey} />}
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

          {/* Recipe edit history */}
          <RecipeEditsSection recipeId={recipe.id} />

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
    </>
  );
}
