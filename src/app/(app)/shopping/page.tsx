"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { calcIngredientCost, decimalToFraction } from "@/lib/units";
import { QtyUnit } from "@/components/ui/fraction-display";
import type { ShoppingItemRow, ShoppingGroup } from "@/types/shopping";

// Debounce helper: returns a function that delays `fn` by `ms` per call key
function useDebouncedCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  return useCallback(
    (key: string, ...args: T) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          fn(...args);
        }, ms),
      );
    },
    [fn, ms],
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatQty(qty: number | null, unit: string | null): string {
  if (!qty && !unit) return "";
  const parts: string[] = [];
  if (qty) parts.push(decimalToFraction(qty));
  if (unit) parts.push(unit);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Item row (General / By Recipe tabs)
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  showRecipe,
  onToggle,
  onDelete,
}: {
  item: ShoppingItemRow;
  showRecipe: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 px-1 transition-opacity",
        item.isChecked && "opacity-50",
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        aria-label={item.isChecked ? "Mark as needed" : "Mark as got it"}
        className={cn(
          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
          item.isChecked
            ? "border-highlight bg-highlight text-background"
            : "border-border bg-card hover:border-highlight/60",
        )}
      >
        {item.isChecked && (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 6l3 3 5-5" />
          </svg>
        )}
      </button>

      {/* Name + recipe source */}
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm font-medium text-text", item.isChecked && "line-through")}>
          {item.name}
        </span>
        {showRecipe && item.recipeName && (
          <span className="ml-2 text-xs text-muted">{item.recipeName}</span>
        )}
        {showRecipe && !item.recipeName && item.isManual && (
          <span className="ml-2 text-xs text-muted">Manually added</span>
        )}
      </div>

      {/* Qty + unit */}
      <QtyUnit
        quantity={item.quantity}
        unit={item.unit}
        className="flex-shrink-0 text-sm font-medium text-text tabular-nums"
      />

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label="Remove item"
        className="flex-shrink-0 text-muted transition-colors hover:text-destructive"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price Calculator tab
// ---------------------------------------------------------------------------

type PriceRow = { storePkgQty: string; storePkgUnit: string; price: string };

function PriceCalculatorTab({
  items,
  priceRows,
  onChange,
}: {
  items: ShoppingItemRow[];
  priceRows: Record<string, PriceRow>;
  onChange: (id: string, field: keyof PriceRow, value: string) => void;
}) {
  // Sort: unchecked first (still need to buy), then alpha
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
        return a.name.localeCompare(b.name);
      }),
    [items],
  );

  const totalCost = useMemo(
    () =>
      sorted.reduce<number | null>((acc, item) => {
        const row = priceRows[item.id];
        if (!row) return acc;
        const recipeQty = item.quantity != null ? String(item.quantity) : null;
        const result = calcIngredientCost(
          recipeQty,
          item.unit,
          row.storePkgQty,
          row.storePkgUnit,
          row.price,
        );
        if (result.status !== "ok") return acc;
        return (acc ?? 0) + result.cost;
      }, null),
    [sorted, priceRows],
  );

  const hasAnyInput = sorted.some((i) => {
    const r = priceRows[i.id];
    return r && (r.storePkgQty || r.price);
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <svg className="h-10 w-10 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-text">No items to price</p>
          <p className="mt-1 text-xs text-muted">Add ingredients to your shopping list first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Enter the store package size and price for each item. RecipeBank calculates your cost for the amount you need.
      </p>

      <div className="overflow-hidden rounded-xl border border-border">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border bg-card px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-text/50">Item</span>
          <span className="w-36 text-right text-xs font-semibold uppercase tracking-wider text-text/50">Store Pkg</span>
          <span className="w-24 text-right text-xs font-semibold uppercase tracking-wider text-text/50">Price</span>
          <span className="w-16 text-right text-xs font-semibold uppercase tracking-wider text-text/50">Cost</span>
        </div>

        {/* Rows */}
        {sorted.map((item) => {
          const row = priceRows[item.id] ?? { storePkgQty: "", storePkgUnit: item.unit ?? "", price: "" };
          const recipeQty = item.quantity != null ? String(item.quantity) : null;
          const result = calcIngredientCost(recipeQty, item.unit, row.storePkgQty, row.storePkgUnit, row.price);
          const recipeLabel = formatQty(item.quantity, item.unit);

          return (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-border/60 px-4 py-3 last:border-b-0",
                item.isChecked && "opacity-50",
              )}
            >
              {/* Item name + recipe source + recipe amount */}
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold text-text", item.isChecked && "line-through")}>
                  {item.name}
                </p>
                <p className="text-xs text-muted">
                  {recipeLabel ? (
                    <>
                      Need: <QtyUnit quantity={item.quantity} unit={item.unit} />
                      {item.recipeName && <> · {item.recipeName}</>}
                    </>
                  ) : (
                    item.recipeName ?? (item.isManual ? "Manually added" : "")
                  )}
                </p>
              </div>

              {/* Store pkg: qty + unit */}
              <div className="flex w-36 items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.storePkgQty}
                  onChange={(e) => onChange(item.id, "storePkgQty", e.target.value)}
                  placeholder="qty"
                  className="w-14 border-b border-border/60 bg-transparent py-0.5 text-right text-sm text-text outline-none placeholder:text-text/30 focus:border-highlight"
                />
                <input
                  type="text"
                  value={row.storePkgUnit}
                  onChange={(e) => onChange(item.id, "storePkgUnit", e.target.value)}
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
                  onChange={(e) => onChange(item.id, "price", e.target.value)}
                  placeholder="0.00"
                  className="w-full border-b border-border/60 bg-transparent py-0.5 text-right text-sm text-text outline-none placeholder:text-text/30 focus:border-highlight"
                />
              </div>

              {/* Calculated cost */}
              <div className="w-16 text-right">
                {result.status === "ok" ? (
                  <span className="text-sm font-medium text-text">${result.cost.toFixed(2)}</span>
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

        {/* Footer total */}
        <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
          <span className="text-sm font-semibold text-text">Estimated total</span>
          {totalCost !== null ? (
            <span className="text-sm font-semibold text-text">${totalCost.toFixed(2)}</span>
          ) : (
            <span className="text-sm text-text/40">
              {hasAnyInput ? "Complete store pkg + price above" : "Enter prices above"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual add row
// ---------------------------------------------------------------------------

function ManualAddRow({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, qty: string, unit: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [adding, setAdding] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await onAdd(name.trim(), qty, unit.trim());
      setName(""); setQty(""); setUnit("");
      nameRef.current?.focus();
    } finally {
      setAdding(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-xl border border-highlight/40 bg-highlight/5 px-3 py-2.5"
    >
      <input
        type="number"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty"
        min="0"
        step="any"
        className="w-14 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight flex-shrink-0"
      />
      <input
        type="text"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        placeholder="Unit"
        className="w-18 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight flex-shrink-0"
      />
      <input
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ingredient name…"
        className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight min-w-0"
      />
      <button
        type="submit"
        disabled={!name.trim() || adding}
        className="flex-shrink-0 rounded-lg bg-highlight px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {adding ? "…" : "Add"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex-shrink-0 text-muted hover:text-text transition-colors"
        aria-label="Cancel"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ tab }: { tab: "general" | "by-recipe" }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <svg className="h-10 w-10 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
      <div>
        <p className="text-sm font-medium text-text">Your shopping list is empty</p>
        <p className="mt-1 text-xs text-muted">
          {tab === "general"
            ? "Add items with the + Add button, or check ingredients off on a recipe page."
            : "Add ingredients from recipe pages to see them grouped here."}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "general" | "by-recipe" | "price-calc";

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("general");
  const [recipeFilter, setRecipeFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Price calculator rows — keyed by item id, persists across tab switches.
  // Seeded from the API on load (which carries persisted Ingredient price data).
  const [priceRows, setPriceRows] = useState<Record<string, PriceRow>>({});

  // ── Data fetching ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shopping");
      if (!res.ok) return;
      const json = await res.json();
      const fetched = (json.data as { items: ShoppingItemRow[] }).items;
      setItems(fetched);
      // Seed price rows from persisted data; only overwrite if not locally edited
      setPriceRows((prev) => {
        const next = { ...prev };
        for (const item of fetched) {
          if (!(item.id in next)) {
            // First load — seed from persisted values (or sensible defaults)
            next[item.id] = {
              storePkgQty:  item.storePkgQty  != null ? String(item.storePkgQty)  : "",
              storePkgUnit: item.storePkgUnit ?? item.unit ?? "",
              price:        item.price        != null ? String(item.price)        : "",
            };
          }
        }
        return next;
      });
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Persist price data — debounced 700ms per item
  const savePrice = useCallback(
    (itemId: string, ingredientId: string | null, row: PriceRow) => {
      const storePkgQty = row.storePkgQty ? parseFloat(row.storePkgQty) : null;
      const price       = row.price       ? parseFloat(row.price)       : null;
      const storePkgUnit = row.storePkgUnit || null;
      const body = { storePkgQty, storePkgUnit, price };

      if (ingredientId) {
        // Shared path — writes to Ingredient, propagates to recipe price calculator
        fetch(`/api/ingredients/${ingredientId}/price`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(console.error);
      } else {
        // Manual item — write to ShoppingItem price fields
        fetch(`/api/shopping/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(console.error);
      }
    },
    [],
  );

  const debouncedSave = useDebouncedCallback(savePrice, 700);

  // Look up the item's ingredientId when scheduling a save
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  function handlePriceRowChange(id: string, field: keyof PriceRow, value: string) {
    setPriceRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    // Schedule a debounced save with the updated row
    const ingredientId = itemsRef.current.find((i) => i.id === id)?.ingredientId ?? null;
    const currentRow = priceRows[id] ?? { storePkgQty: "", storePkgUnit: "", price: "" };
    const updatedRow = { ...currentRow, [field]: value };
    debouncedSave(id, id, ingredientId, updatedRow);
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const totalItems = items.length;
  const checkedItems = items.filter((i) => i.isChecked).length;

  // Unique recipes for the By Recipe filter dropdown
  const recipeOptions = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((i) => {
      if (i.recipeId && i.recipeName) map.set(i.recipeId, i.recipeName);
    });
    const hasManual = items.some((i) => i.isManual);
    return {
      recipes: Array.from(map.entries()).map(([id, name]) => ({ id, name })),
      hasManual,
    };
  }, [items]);

  // General tab: unchecked first, then alpha
  const generalItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
        return a.name.localeCompare(b.name);
      }),
    [items],
  );

  // By Recipe tab: group + optionally filter
  const groups = useMemo<ShoppingGroup[]>(() => {
    const filtered =
      recipeFilter === "all"
        ? items
        : recipeFilter === "manual"
          ? items.filter((i) => i.isManual)
          : items.filter((i) => i.recipeId === recipeFilter);

    const map = new Map<string | null, ShoppingGroup>();
    filtered.forEach((item) => {
      const key = item.recipeId ?? null;
      if (!map.has(key)) {
        map.set(key, {
          recipeId: key,
          recipeName: item.recipeName ?? "Manually added",
          items: [],
        });
      }
      map.get(key)!.items.push(item);
    });

    for (const group of map.values()) {
      group.items.sort((a, b) => {
        if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      if (!a.recipeId && b.recipeId) return 1;
      if (a.recipeId && !b.recipeId) return -1;
      return a.recipeName.localeCompare(b.recipeName);
    });
  }, [items, recipeFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleToggle(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isChecked: !i.isChecked } : i)),
    );
    try {
      await fetch(`/api/shopping/items/${id}`, { method: "PATCH" });
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, isChecked: !i.isChecked } : i)),
      );
    }
  }

  async function handleDelete(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setPriceRows((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      await fetch(`/api/shopping/items/${id}`, { method: "DELETE" });
    } catch {
      setItems(snapshot);
    }
  }

  async function handleDeleteAll() {
    const snapshot = items;
    setItems([]);
    setPriceRows({});
    setConfirmDeleteAll(false);
    try {
      await fetch("/api/shopping", { method: "DELETE" });
    } catch {
      setItems(snapshot);
    }
  }

  async function handleClearChecked() {
    const checkedIds = items.filter((i) => i.isChecked).map((i) => i.id);
    if (checkedIds.length === 0) return;
    const snapshot = items;
    // Optimistic: remove the checked items from the list entirely.
    // They should disappear here and revert to "Have It" (not-in-list) on recipe pages.
    setItems((prev) => prev.filter((i) => !i.isChecked));
    setPriceRows((prev) => {
      const next = { ...prev };
      for (const id of checkedIds) delete next[id];
      return next;
    });
    try {
      await Promise.all(
        checkedIds.map((id) => fetch(`/api/shopping/items/${id}`, { method: "DELETE" })),
      );
    } catch {
      setItems(snapshot);
    }
  }

  async function handleManualAdd(name: string, qty: string, unit: string) {
    const res = await fetch("/api/shopping/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isManual: true,
        name,
        quantity: qty ? parseFloat(qty) : null,
        unit: unit || null,
      }),
    });
    if (res.ok) await load();
  }

  const TAB_LABELS: Record<Tab, string> = {
    "general": "General",
    "by-recipe": "By Recipe",
    "price-calc": "Price Calculator",
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Shopping List</h1>
          {!loading && (
            <p className="mt-0.5 text-sm text-muted">
              {totalItems} {totalItems === 1 ? "item" : "items"}
              {totalItems > 0 && ` · ${checkedItems} checked`}
            </p>
          )}
        </div>

        {tab !== "price-calc" && (
          <button
            type="button"
            onClick={() => { setShowAdd((v) => !v); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              showAdd
                ? "border-highlight bg-highlight/10 text-highlight"
                : "border-border bg-card text-text hover:bg-card-hover",
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add
          </button>
        )}
      </div>

      {/* Manual add row */}
      {showAdd && tab !== "price-calc" && (
        <ManualAddRow
          onAdd={handleManualAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Tab row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pill tab switcher */}
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
            {(["general", "by-recipe", "price-calc"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setShowAdd(false); }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                  tab === t
                    ? "bg-text text-background shadow-sm"
                    : "text-text/60 hover:text-text",
                )}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Recipe filter — only shown on By Recipe tab */}
          {tab === "by-recipe" && (recipeOptions.recipes.length > 0 || recipeOptions.hasManual) && (
            <select
              value={recipeFilter}
              onChange={(e) => setRecipeFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20"
            >
              <option value="all">All recipes</option>
              {recipeOptions.recipes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
              {recipeOptions.hasManual && (
                <option value="manual">Manually added</option>
              )}
            </select>
          )}
        </div>

        {/* Right-side actions: Clear checked + Delete all */}
        {tab !== "price-calc" && (checkedItems > 0 || totalItems > 0) && (
          <div className="flex items-center gap-4">
            {checkedItems > 0 && (
              <button
                type="button"
                onClick={handleClearChecked}
                className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                Clear checked
              </button>
            )}

            {totalItems > 0 && (
              confirmDeleteAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Delete everything?</span>
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Yes, delete all
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAll(false)}
                    className="text-xs text-muted hover:text-text transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAll(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-destructive transition-opacity hover:opacity-75"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19 7-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                  </svg>
                  Delete all
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-3 py-3 px-1">
              <div className="h-5 w-5 rounded border-2 border-border bg-card flex-shrink-0" />
              <div className="flex-1 h-4 rounded bg-border/50 animate-pulse" style={{ width: `${40 + n * 12}%` }} />
              <div className="h-4 w-16 rounded bg-border/50 animate-pulse" />
            </div>
          ))}
        </div>
      ) : tab === "price-calc" ? (
        <PriceCalculatorTab
          items={items}
          priceRows={priceRows}
          onChange={handlePriceRowChange}
        />
      ) : tab === "general" ? (
        generalItems.length === 0 ? (
          <EmptyState tab="general" />
        ) : (
          <div className="divide-y divide-border">
            {generalItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                showRecipe
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )
      ) : (
        groups.length === 0 ? (
          <EmptyState tab="by-recipe" />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.recipeId ?? "manual"}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                  {group.recipeName}
                </p>
                <div className="divide-y divide-border">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      showRecipe={false}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
