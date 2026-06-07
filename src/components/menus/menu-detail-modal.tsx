"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { formatCost, parseCost } from "@/lib/cost";
import type { MenuDetail, MenuRecipeItem, MenuSummary, MenuUsageRecord } from "@/types/menu";
import type { PickerRecipe } from "@/types/calendar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate) return null;
  const fmtOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const startLabel = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", fmtOpts);
  if (!endDate) return startLabel;
  const [ey, em, ed] = endDate.split("-").map(Number);
  const endLabel = new Date(ey, em - 1, ed).toLocaleDateString("en-US", fmtOpts);
  return `${startLabel} – ${endLabel}`;
}

/** Derive currentUsage from a list of usages (same logic as the API). */
function deriveCurrentUsage(usages: MenuUsageRecord[], today: string): MenuUsageRecord | null {
  return usages.find(
    (u) => u.startDate <= today && (u.endDate === null || u.endDate >= today),
  ) ?? null;
}

/** Derive next planned usage from a list of usages (type=planned, startDate > today, earliest). */
function deriveNextPlanned(usages: MenuUsageRecord[], today: string): MenuUsageRecord | null {
  const candidates = usages
    .filter((u) => u.type === "planned" && u.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Sortable item wrapper
// ---------------------------------------------------------------------------

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "opacity-50 z-50")}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label="Drag to reorder"
          className="flex-shrink-0 mt-3 cursor-grab active:cursor-grabbing text-muted/40 hover:text-muted transition-colors"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe Picker (inline for add-recipe)
// ---------------------------------------------------------------------------

function InlineRecipePicker({
  onSelect,
  onClose,
}: {
  onSelect: (r: PickerRecipe) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [recipes, setRecipes] = useState<PickerRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = query.trim()
      ? `/api/recipes?q=${encodeURIComponent(query.trim())}&limit=100`
      : `/api/recipes?limit=100`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setRecipes((json.data?.recipes ?? []) as PickerRecipe[]); })
      .catch(() => { if (!cancelled) setRecipes([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <div className="mt-4 rounded-xl border border-border bg-background overflow-hidden">
      <div className="border-b border-border px-3 py-2.5 flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20"
          />
        </div>
        <button type="button" onClick={onClose} className="flex-shrink-0 text-muted hover:text-text transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-border animate-pulse flex-shrink-0" />
                <div className="flex-1 h-4 rounded bg-border/70 animate-pulse" />
              </div>
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {query ? `No recipes matching "${query}"` : "No recipes yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {recipes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-card-hover transition-colors"
                >
                  {r.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-border/40 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{r.title}</p>
                    {(r.cuisine || r.dishType) && (
                      <p className="text-xs text-muted truncate">{[r.cuisine, r.dishType].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MenuDetailModal
// ---------------------------------------------------------------------------

type Props = {
  menuId: string;
  initialMode?: "view" | "edit";
  onClose: () => void;
  onUpdated: (m: MenuSummary) => void;
  onDeleted: (id: string) => void;
};

export function MenuDetailModal({ menuId, initialMode = "view", onClose, onUpdated, onDeleted }: Props) {
  const [menu, setMenu] = useState<MenuDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">(initialMode);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Items state (managed separately for optimistic updates)
  const [items, setItems] = useState<MenuRecipeItem[]>([]);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  // Usage state
  const [allUsages, setAllUsages] = useState<MenuUsageRecord[]>([]);
  const [logPanelOpen, setLogPanelOpen] = useState<"log" | "plan" | null>(null);
  const [logForm, setLogForm] = useState({ startDate: "", endDate: "", notes: "" });
  const [savingUsage, setSavingUsage] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor));

  const today = localToday();

  // Derived from allUsages
  const currentUsage = deriveCurrentUsage(allUsages, today);
  const nextPlannedUsage = deriveNextPlanned(allUsages, today);

  // Fetch menu data
  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/menus/${menuId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load menu"); return; }
      const data = json.data as MenuDetail;
      setMenu(data);
      setItems(data.items ?? []);
      setAllUsages(data.allUsages ?? []);
      setEditTitle(data.title);
      setEditDescription(data.description ?? "");
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [menuId]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  // Escape key closes modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus title when entering edit mode
  useEffect(() => {
    if (mode === "edit" && !loading) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [mode, loading]);

  // Save menu-level edits (title + description only)
  async function handleSave() {
    if (!menu) return;
    setEditError(null);
    if (!editTitle.trim()) { setEditError("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/menus/${menuId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error ?? "Failed to save"); return; }
      const updated = json.data as MenuDetail;
      setMenu(updated);
      setItems(updated.items ?? items);
      setAllUsages(updated.allUsages ?? allUsages);
      onUpdated(updated);
      setMode("view");
    } catch {
      setEditError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  // Recompute item-derived summary fields and push them up to the parent list
  // so Sort (Most Recipes) / pill display stay in sync without a reload —
  // same propagation discipline as usage changes.
  const propagateItemsChange = useCallback((base: MenuDetail, nextItems: MenuRecipeItem[]) => {
    // Recompute the menu total from each item's (already scaled) estimatedCost.
    // The server recomputes this authoritatively on next load; this just keeps
    // the pill accurate after an optimistic add/remove/servings change.
    const itemCosts = nextItems.map((it) => parseCost(it.recipe.estimatedCost));
    const anyUnpriced = itemCosts.some((c) => c === null);
    const sum = itemCosts.reduce<number | null>(
      (acc, c) => (c !== null ? (acc ?? 0) + c : acc),
      null,
    );
    const updated: MenuDetail = {
      ...base,
      items: nextItems,
      itemCount: nextItems.length,
      totalServings: nextItems.reduce((s, it) => s + it.servings, 0),
      recipePhotoUrls: nextItems.map((it) => it.recipe.photoUrl),
      totalCost: sum !== null ? formatCost(sum) : null,
      isPartialCost: sum !== null && (anyUnpriced || base.isPartialCost),
    };
    setMenu(updated);
    onUpdated(updated);
  }, [onUpdated]);

  // Patch a single item
  async function patchItem(itemId: string, data: Record<string, unknown>) {
    setSavingItemId(itemId);
    try {
      const res = await fetch(`/api/menus/${menuId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && menu) {
        const updatedItem = json.data as MenuRecipeItem;
        const nextItems = items.map((it) => (it.id === itemId ? updatedItem : it));
        setItems(nextItems);
        propagateItemsChange(menu, nextItems);
      }
    } finally {
      setSavingItemId(null);
    }
  }

  // Delete a single item
  async function deleteItem(itemId: string) {
    const nextItems = items.filter((it) => it.id !== itemId);
    setItems(nextItems);
    if (menu) propagateItemsChange(menu, nextItems);
    await fetch(`/api/menus/${menuId}/items/${itemId}`, { method: "DELETE" });
  }

  // Add a recipe
  async function handleAddRecipe(recipe: PickerRecipe) {
    setShowRecipePicker(false);
    try {
      const res = await fetch(`/api/menus/${menuId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      const json = await res.json();
      if (res.ok && menu) {
        const newItem = json.data as MenuRecipeItem;
        const nextItems = [...items, newItem];
        setItems(nextItems);
        propagateItemsChange(menu, nextItems);
      }
    } catch { /* ignore */ }
  }

  // Drag end - reorder
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    const newOrder = arrayMove(items, oldIndex, newIndex);
    setItems(newOrder);
    if (menu) propagateItemsChange(menu, newOrder);

    await fetch(`/api/menus/${menuId}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: newOrder.map((it) => it.id) }),
    });
  }

  // Recompute usage-derived summary fields and push them up to the parent list
  // so Sort/Filter (which operate on the parent's summaries) stay in sync.
  const propagateUsageChange = useCallback((base: MenuDetail, nextUsages: MenuUsageRecord[]) => {
    const updated: MenuDetail = {
      ...base,
      allUsages: [...nextUsages].sort((a, b) => b.startDate.localeCompare(a.startDate)),
      currentUsage: deriveCurrentUsage(nextUsages, today),
      nextPlannedUsage: deriveNextPlanned(nextUsages, today),
      usageCount: nextUsages.filter((u) => u.type === "logged").length,
    };
    setMenu(updated);
    onUpdated(updated);
  }, [today, onUpdated]);

  // Save a usage (log or plan)
  async function handleSaveUsage() {
    if (!logPanelOpen || !logForm.startDate) return;
    setSavingUsage(true);
    try {
      const res = await fetch(`/api/menus/${menuId}/usages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: logForm.startDate,
          endDate: logForm.endDate || null,
          type: logPanelOpen === "log" ? "logged" : "planned",
          notes: logForm.notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok && menu) {
        const newUsage = json.data as MenuUsageRecord;
        const nextUsages = [...allUsages, newUsage];
        setAllUsages(nextUsages);
        propagateUsageChange(menu, nextUsages);
      }
      setLogPanelOpen(null);
      setLogForm({ startDate: "", endDate: "", notes: "" });
    } catch { /* ignore */ } finally {
      setSavingUsage(false);
    }
  }

  // Delete a usage
  async function handleDeleteUsage(usageId: string) {
    if (!menu) return;
    const nextUsages = allUsages.filter((u) => u.id !== usageId);
    setAllUsages(nextUsages);
    propagateUsageChange(menu, nextUsages);
    await fetch(`/api/menus/${menuId}/usages/${usageId}`, { method: "DELETE" });
  }

  // Sort usages by date DESC for display
  const sortedUsages = [...allUsages].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-6 w-48 rounded bg-border/30 animate-pulse" />
            <div className="h-4 w-64 rounded bg-border/20 animate-pulse" />
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" onClick={onClose} className="mt-4 text-sm text-muted hover:text-text">Close</button>
          </div>
        ) : menu ? (
          <>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border px-6 py-4">
              {mode === "view" ? (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={onClose} aria-label="Close"
                        className="flex-shrink-0 rounded-lg p-1 text-muted hover:bg-card-hover hover:text-text transition-colors">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <h2 className="text-xl font-bold text-text truncate">{menu.title}</h2>
                      {currentUsage && (
                        <span className="flex-shrink-0 rounded-full bg-highlight/15 px-2 py-0.5 text-xs font-medium text-highlight">
                          Current · {formatDateRange(currentUsage.startDate, currentUsage.endDate)}
                        </span>
                      )}
                      {!currentUsage && nextPlannedUsage && (
                        <span className="flex-shrink-0 rounded-full bg-border/40 px-2 py-0.5 text-xs text-muted">
                          Planned · {formatDateRange(nextPlannedUsage.startDate, nextPlannedUsage.endDate)}
                        </span>
                      )}
                    </div>
                    {menu.description && (
                      <p className="ml-8 mt-0.5 text-sm text-muted">{menu.description}</p>
                    )}
                    <p className="ml-8 text-xs text-muted mt-1">
                      {menu.totalServings} serving{menu.totalServings !== 1 ? "s" : ""} total
                      {menu.totalCost && ` · ~${menu.totalCost} estimated`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setMode("edit")}
                    className="flex-shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-text hover:bg-card-hover transition-colors">
                    Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setMode("view"); setEditError(null); }} aria-label="Cancel"
                      className="flex-shrink-0 rounded-lg p-1 text-muted hover:bg-card-hover hover:text-text transition-colors">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                        <path d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <h2 className="text-lg font-bold text-text">Edit Menu</h2>
                  </div>
                  <input
                    ref={titleRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Menu title"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
                  />
                  {editError && <p className="text-xs text-destructive">{editError}</p>}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={handleSave} disabled={saving || !editTitle.trim()}
                      className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => { setMode("view"); setEditError(null); }}
                      className="text-sm text-muted hover:text-text transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Item list */}
              {items.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted">No recipes in this menu yet.</p>
                </div>
              ) : mode === "view" ? (
                <ul className="divide-y divide-border/60">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-6 py-3">
                      {item.recipe.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.recipe.photoUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0 mt-0.5" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-border/40 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/recipes/${item.recipe.id}`}
                          onClick={onClose}
                          className="text-sm font-semibold text-text hover:text-highlight transition-colors truncate block"
                        >
                          {item.recipe.title}
                        </Link>
                        <p className="text-xs text-muted mt-0.5">
                          {item.cookDate ? (
                            <>
                              {new Date(...(item.cookDate.split("-").map(Number) as [number, number, number])).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {" · "}
                            </>
                          ) : "Unscheduled · "}
                          {item.servings} serving{item.servings !== 1 ? "s" : ""}
                          {item.recipe.estimatedCost ? ` · ${item.recipe.estimatedCost}` : " · —"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                /* Edit mode items */
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                    <ul className="divide-y divide-border/60 px-4 py-2">
                      {items.map((item) => (
                        <li key={item.id} className="py-2">
                          <SortableItem id={item.id}>
                            <div className="flex items-start gap-2">
                              {item.recipe.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.recipe.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0 mt-1" />
                              ) : (
                                <div className="h-10 w-10 rounded-lg bg-border/40 flex-shrink-0 mt-1" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-text truncate">{item.recipe.title}</p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {/* Cook date */}
                                  <input
                                    type="date"
                                    value={item.cookDate ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value || null;
                                      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, cookDate: val } : it));
                                    }}
                                    onBlur={(e) => patchItem(item.id, { cookDate: e.target.value || null })}
                                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-text outline-none focus:border-highlight"
                                  />
                                  {/* Servings */}
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.servings}
                                      onChange={(e) => {
                                        const v = Math.max(1, parseInt(e.target.value) || 1);
                                        setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, servings: v } : it));
                                      }}
                                      onBlur={(e) => patchItem(item.id, { servings: Math.max(1, parseInt(e.target.value) || 1) })}
                                      className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs text-text outline-none focus:border-highlight"
                                    />
                                    <span className="text-xs text-muted">servings</span>
                                  </div>
                                  {savingItemId === item.id && (
                                    <span className="text-xs text-muted animate-pulse">Saving…</span>
                                  )}
                                </div>
                                {/* Cook log prompt */}
                                {item.cookDate && item.cookDate < today && !item.notes && (
                                  <div className="mt-2">
                                    <textarea
                                      placeholder="How did it go?"
                                      rows={2}
                                      defaultValue=""
                                      onBlur={(e) => {
                                        if (e.target.value.trim()) {
                                          patchItem(item.id, { notes: e.target.value.trim() });
                                        }
                                      }}
                                      className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-xs text-text outline-none placeholder:text-muted focus:border-highlight resize-none"
                                    />
                                  </div>
                                )}
                              </div>
                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={() => deleteItem(item.id)}
                                aria-label={`Remove ${item.recipe.title}`}
                                className="flex-shrink-0 mt-1 text-muted hover:text-destructive transition-colors"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                  <path d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </SortableItem>
                        </li>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}

              {/* Add recipe button (edit mode only) */}
              {mode === "edit" && (
                <div className="px-6 pb-4">
                  {items.length < 10 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowRecipePicker((v) => !v)}
                        className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted hover:border-highlight hover:text-highlight transition-colors w-full justify-center"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add recipe
                      </button>
                      {showRecipePicker && (
                        <InlineRecipePicker
                          onSelect={handleAddRecipe}
                          onClose={() => setShowRecipePicker(false)}
                        />
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted text-center py-2">Maximum 10 recipes per menu</p>
                  )}
                </div>
              )}

              {/* Log/Plan panel (view mode only) */}
              {mode === "view" && (
                <div className="border-t border-border/60 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLogPanelOpen(logPanelOpen === "log" ? null : "log");
                        setLogForm({ startDate: "", endDate: "", notes: "" });
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        logPanelOpen === "log"
                          ? "border-highlight bg-highlight/10 text-highlight"
                          : "border-border bg-card text-text hover:bg-card-hover",
                      )}
                    >
                      Log Menu
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLogPanelOpen(logPanelOpen === "plan" ? null : "plan");
                        setLogForm({ startDate: "", endDate: "", notes: "" });
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        logPanelOpen === "plan"
                          ? "border-highlight bg-highlight/10 text-highlight"
                          : "border-border bg-card text-text hover:bg-card-hover",
                      )}
                    >
                      Plan Menu
                    </button>
                  </div>

                  {logPanelOpen && (
                    <div className="mt-3 rounded-xl border border-border bg-background p-4 space-y-3">
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                        {logPanelOpen === "log" ? "Log a past or current use" : "Plan a future use"}
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-muted block mb-1">
                            Start date <span className="text-destructive">*</span>
                          </label>
                          <input
                            type="date"
                            value={logForm.startDate}
                            onChange={(e) => setLogForm((f) => ({ ...f, startDate: e.target.value, endDate: e.target.value ? f.endDate : "" }))}
                            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-medium text-muted block mb-1">End date <span className="text-muted font-normal">(optional)</span></label>
                          <input
                            type="date"
                            value={logForm.endDate}
                            min={logForm.startDate || undefined}
                            disabled={!logForm.startDate}
                            onChange={(e) => setLogForm((f) => ({ ...f, endDate: e.target.value }))}
                            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20 disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted block mb-1">Notes <span className="text-muted font-normal">(optional)</span></label>
                        <textarea
                          value={logForm.notes}
                          onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
                          placeholder="Any notes about this use…"
                          rows={2}
                          className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleSaveUsage}
                          disabled={savingUsage || !logForm.startDate}
                          className="rounded-lg bg-highlight px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {savingUsage ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setLogPanelOpen(null); setLogForm({ startDate: "", endDate: "", notes: "" }); }}
                          className="text-sm text-muted hover:text-text transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Usage history (view mode only) */}
              {mode === "view" && sortedUsages.length > 0 && (
                <div className="border-t border-border/60 px-6 py-4">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Usage history</p>
                  <ul className="space-y-1.5">
                    {sortedUsages.map((usage) => (
                      <li key={usage.id} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-text">
                            {formatDateRange(usage.startDate, usage.endDate)}
                          </span>
                          {usage.notes && (
                            <span className="ml-2 text-xs text-muted truncate">{usage.notes}</span>
                          )}
                        </div>
                        <span className={cn(
                          "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          usage.type === "logged"
                            ? "bg-border/40 text-muted"
                            : "bg-highlight/15 text-highlight",
                        )}>
                          {usage.type === "logged" ? "Logged" : "Planned"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteUsage(usage.id)}
                          aria-label="Delete usage"
                          className="flex-shrink-0 text-muted/50 hover:text-destructive transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-border px-6 py-3 flex items-center justify-between">
              <p className="text-xs text-muted">{items.length} recipe{items.length !== 1 ? "s" : ""}</p>
              <button
                type="button"
                onClick={() => onDeleted(menu.id)}
                className="text-xs text-muted hover:text-destructive transition-colors"
              >
                Delete menu
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
