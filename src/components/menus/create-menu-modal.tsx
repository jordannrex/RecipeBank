"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MenuDetail } from "@/types/menu";
import type { PickerRecipe } from "@/types/calendar";

// ---------------------------------------------------------------------------
// Staged recipe item for wizard step 2
// ---------------------------------------------------------------------------

type StagedItem = {
  recipe: PickerRecipe & { currentServings?: number };
  servings: number;
  cookDate: string;
};

// ---------------------------------------------------------------------------
// CreateMenuModal — 2-step wizard
// ---------------------------------------------------------------------------

type Props = {
  onClose: () => void;
  onCreated: (menu: MenuDetail) => void;
};

export function CreateMenuModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Step 2 state
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [query, setQuery] = useState("");
  const [recipes, setRecipes] = useState<PickerRecipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    if (step === 2) setTimeout(() => searchRef.current?.focus(), 50);
  }, [step]);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load recipes in step 2
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setLoadingRecipes(true);
    const url = query.trim()
      ? `/api/recipes?q=${encodeURIComponent(query.trim())}&limit=100`
      : `/api/recipes?limit=100`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setRecipes((json.data?.recipes ?? []) as PickerRecipe[]); })
      .catch(() => { if (!cancelled) setRecipes([]); })
      .finally(() => { if (!cancelled) setLoadingRecipes(false); });
    return () => { cancelled = true; };
  }, [query, step]);

  function handleSelectRecipe(recipe: PickerRecipe) {
    if (stagedItems.length >= 10) return;
    if (stagedItems.some((it) => it.recipe.id === recipe.id)) return;
    const servings = (recipe as PickerRecipe & { currentServings?: number }).currentServings ?? 4;
    setStagedItems((prev) => [...prev, { recipe, servings, cookDate: "" }]);
  }

  function updateStaged(idx: number, patch: Partial<StagedItem>) {
    setStagedItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeStaged(idx: number) {
    setStagedItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalServings = stagedItems.reduce((sum, it) => sum + it.servings, 0);

  async function handleCreate() {
    setError(null);
    if (!title.trim()) { setError("Title is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/menus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          items: stagedItems.map((it) => ({
            recipeId: it.recipe.id,
            servings: it.servings,
            ...(it.cookDate ? { cookDate: it.cookDate } : {}),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to create menu"); return; }
      onCreated(json.data as MenuDetail);
      onClose();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wide">
              Step {step} of 2
            </p>
            <h2 className="text-lg font-bold text-text">
              {step === 1 ? "Name & Schedule" : "Add Recipes"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-lg p-1.5 text-muted hover:bg-card-hover hover:text-text transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {step === 1 ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                Menu name <span className="text-destructive">*</span>
              </label>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Week 1, Summer BBQ…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                Description <span className="text-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description…"
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-text mb-1.5">Start date <span className="text-muted font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!e.target.value) setEndDate("");
                  }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-text mb-1.5">End date <span className="text-muted font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={!startDate}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20 disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            {/* Search bar */}
            <div className="flex-shrink-0 border-b border-border px-4 py-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search recipes…"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
              {/* Recipe list */}
              <div className="max-h-48 overflow-y-auto border-b border-border/60 flex-shrink-0">
                {loadingRecipes ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-3 py-1">
                        <div className="h-10 w-10 rounded-lg bg-border animate-pulse flex-shrink-0" />
                        <div className="flex-1 h-4 rounded bg-border/70 animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : recipes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">
                    {query ? `No recipes matching "${query}"` : "No recipes yet."}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {recipes.map((r) => {
                      const alreadyAdded = stagedItems.some((it) => it.recipe.id === r.id);
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            disabled={alreadyAdded || stagedItems.length >= 10}
                            onClick={() => handleSelectRecipe(r)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                              alreadyAdded ? "opacity-40 cursor-default" : "hover:bg-card-hover",
                              stagedItems.length >= 10 && !alreadyAdded ? "opacity-30 cursor-not-allowed" : "",
                            )}
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
                            {alreadyAdded && (
                              <svg className="h-4 w-4 flex-shrink-0 text-highlight" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Staged items */}
              {stagedItems.length > 0 && (
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide">Selected ({stagedItems.length}/10)</p>
                  {stagedItems.map((item, idx) => (
                    <div key={item.recipe.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                      {item.recipe.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.recipe.photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-border/40 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">{item.recipe.title}</p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={item.servings}
                        onChange={(e) => updateStaged(idx, { servings: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-14 rounded-lg border border-border bg-card px-2 py-1 text-xs text-text outline-none focus:border-highlight"
                        title="Servings"
                      />
                      {startDate && (
                        <input
                          type="date"
                          value={item.cookDate}
                          min={startDate}
                          max={endDate || undefined}
                          onChange={(e) => updateStaged(idx, { cookDate: e.target.value })}
                          className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-text outline-none focus:border-highlight"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeStaged(idx)}
                        aria-label={`Remove ${item.recipe.title}`}
                        className="flex-shrink-0 text-muted hover:text-destructive transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Live totals */}
                  <p className="text-xs text-muted pt-1">
                    {totalServings} serving{totalServings !== 1 ? "s" : ""} total
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border px-6 py-4 flex items-center justify-between gap-3">
          {error && <p className="text-xs text-destructive flex-1">{error}</p>}
          <div className="flex items-center gap-3 ml-auto">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)}
                className="text-sm text-muted hover:text-text transition-colors">
                ← Back
              </button>
            )}
            {step === 1 ? (
              <button
                type="button"
                disabled={!title.trim()}
                onClick={() => setStep(2)}
                className="rounded-lg bg-highlight px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleCreate}
                className="rounded-lg bg-highlight px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create Menu"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
