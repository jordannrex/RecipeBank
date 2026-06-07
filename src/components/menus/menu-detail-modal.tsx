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
import type { MenuDetail, MenuRecipeItem, MenuSummary } from "@/types/menu";
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
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Items state (managed separately for optimistic updates)
  const [items, setItems] = useState<MenuRecipeItem[]>([]);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor));

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
      setItems(data.items);
      setEditTitle(data.title);
      setEditDescription(data.description ?? "");
      setEditStartDate(data.startDate ?? "");
      setEditEndDate(data.endDate ?? "");
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

  // Save menu-level edits
  async function handleSave() {
    if (!menu) return;
    setEditError(null);
    if (!editTitle.trim()) { setEditError("Title is required"); return; }
    if (editStartDate && editEndDate && editEndDate < editStartDate) {
      setEditError("End date must be on or after start date");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/menus/${menuId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          startDate: editStartDate || null,
          endDate: editEndDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error ?? "Failed to save"); return; }
      const updated = json.data as MenuDetail;
      setMenu(updated);
      setItems(updated.items);
      onUpdated(updated);
      setMode("view");
    } catch {
      setEditError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

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
      if (res.ok) {
        const updated = json.data as MenuRecipeItem;
        setItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
        // Update summary totals
        setMenu((prev) => prev ? {
          ...prev,
          totalServings: items.map((it) => it.id === itemId ? (data.servings as number ?? it.servings) : it.servings).reduce((a, b) => a + b, 0),
        } : prev);
      }
    } finally {
      setSavingItemId(null);
    }
  }

  // Delete a single item
  async function deleteItem(itemId: string) {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    await fetch(`/api/menus/${menuId}/items/${itemId}`, { method: "DELETE" });
    // Update menu summary
    setMenu((prev) => prev ? { ...prev, itemCount: prev.itemCount - 1 } : prev);
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
      if (res.ok) {
        const newItem = json.data as MenuRecipeItem;
        setItems((prev) => [...prev, newItem]);
        setMenu((prev) => prev ? { ...prev, itemCount: prev.itemCount + 1 } : prev);
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

    await fetch(`/api/menus/${menuId}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: newOrder.map((it) => it.id) }),
    });
  }

  const today = localToday();
  const startDatePast = menu?.startDate ? menu.startDate < today : false;

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
                    </div>
                    {(menu.startDate || menu.description) && (
                      <div className="ml-8 mt-0.5 space-y-0.5">
                        {menu.startDate && (
                          <p className="text-sm text-muted">{formatDateRange(menu.startDate, menu.endDate)}</p>
                        )}
                        {menu.description && (
                          <p className="text-sm text-muted">{menu.description}</p>
                        )}
                      </div>
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
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted block mb-1">Start date</label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => {
                          setEditStartDate(e.target.value);
                          if (!e.target.value) setEditEndDate("");
                        }}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted block mb-1">End date</label>
                      <input
                        type="date"
                        value={editEndDate}
                        min={editStartDate || undefined}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        disabled={!editStartDate}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20 disabled:opacity-50"
                      />
                    </div>
                  </div>
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

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
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
                                    min={menu.startDate ?? undefined}
                                    max={menu.endDate ?? undefined}
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
                                    <span className="text-xs text-muted">svgs</span>
                                  </div>
                                  {savingItemId === item.id && (
                                    <span className="text-xs text-muted animate-pulse">Saving…</span>
                                  )}
                                </div>
                                {/* Cook log prompt */}
                                {startDatePast && item.cookDate && item.cookDate < today && !item.notes && (
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
