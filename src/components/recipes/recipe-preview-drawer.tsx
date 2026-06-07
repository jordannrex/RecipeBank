"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { QtyUnit } from "@/components/ui/fraction-display";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DrawerRecipe = {
  id: string;
  title: string;
  description: string | null;
  photoUrl: string | null;
  cuisine: string | null;
  dishType: string | null;
  complexity: string;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredientGroups: Array<{
    id: string;
    name: string;
    ingredients: Array<{
      id: string;
      name: string;
      quantity: string | null;   // Decimal serialised as string
      unit: string | null;
      preparation: string | null;
    }>;
  }>;
};

// ---------------------------------------------------------------------------
// Date helpers (self-contained, no external deps)
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isFuture(s: string): boolean { return s > todayStr(); }

function buildCalGrid(year: number, month: number) {
  const firstDow    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev  = new Date(year, month - 1, 0).getDate();
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;
  const cells: { date: string; current: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ date: fmtDate(prevY, prevM, daysInPrev - i), current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: fmtDate(year, month, d), current: true });
  for (let d = 1; cells.length < 42; d++)
    cells.push({ date: fmtDate(nextY, nextM, d), current: false });
  return cells;
}

function fmtDisplayDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DOW_MINI = ["S","M","T","W","T","F","S"];

// ---------------------------------------------------------------------------
// Small display helpers
// ---------------------------------------------------------------------------

function formatTime(prep: number | null, cook: number | null): string {
  const total = (prep ?? 0) + (cook ?? 0);
  if (!total) return "";
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}


const COMPLEXITY_COLOR: Record<string, string> = {
  EASY: "#22c55e", MEDIUM: "#f59e0b", HARD: "#ef4444",
};
const COMPLEXITY_LABEL: Record<string, string> = {
  EASY: "Easy", MEDIUM: "Medium", HARD: "Hard",
};

// ---------------------------------------------------------------------------
// Mini Calendar (inline, inside drawer)
// ---------------------------------------------------------------------------

type CalendarAction = "idle" | "logging" | "planning" | "success";

function MiniCalendar({ recipeId }: { recipeId: string }) {
  const today = todayStr();
  const [year, setYear]   = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes]       = useState("");
  const [action, setAction]     = useState<CalendarAction>("idle");
  const [saving, setSaving]     = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const grid = buildCalGrid(year, month);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function handleDayClick(date: string) {
    if (isFuture(date)) {
      // Future → show confirmation before saving
      setSelected(date);
      setAction("planning");
      setFeedback(null);
    } else {
      // Past / today → show notes form
      setSelected(date);
      setAction("logging");
      setFeedback(null);
      setNotes("");
      setTimeout(() => notesRef.current?.focus(), 50);
    }
  }

  async function handleMealPlan(date: string) {
    setSaving(true);
    setFeedback(null);
    try {
      const res  = await fetch("/api/meal-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, plannedDate: date }),
      });
      const json = await res.json();
      if (!res.ok) { setFeedback(json.error ?? "Failed to add"); return; }
      setFeedback(`Planned for ${fmtDisplayDate(date)}!`);
      setAction("success");
      setSelected(null);
    } catch {
      setFeedback("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCookLog(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res  = await fetch(`/api/recipes/${recipeId}/cook-log`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookedAt: selected, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) { setFeedback(json.error ?? "Failed to log"); return; }
      setFeedback(`Logged for ${fmtDisplayDate(selected)}!`);
      setAction("success");
      setSelected(null);
    } catch {
      setFeedback("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3 space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-card-hover hover:text-text transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-text">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button type="button" onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-card-hover hover:text-text transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 text-center">
        {DOW_MINI.map((d, i) => (
          <span key={i} className="py-0.5 text-[10px] font-semibold text-muted/70">{d}</span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map(({ date, current }, i) => {
          const isToday   = date === today;
          const future    = isFuture(date);
          const isPast    = !future && date !== today;
          const isSelected = date === selected;
          return (
            <button
              key={i}
              type="button"
              disabled={saving}
              onClick={() => current && handleDayClick(date)}
              className={cn(
                "flex h-7 w-full items-center justify-center rounded-md text-xs transition-colors",
                !current && "opacity-25 pointer-events-none",
                current && future && "text-highlight hover:bg-highlight/10",
                current && !future && "text-text hover:bg-card-hover",
                isToday && "ring-1 ring-highlight font-semibold",
                isSelected && "bg-highlight text-white",
                isPast && current && !isSelected && "text-muted",
              )}
            >
              {date.split("-")[2].replace(/^0/, "")}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 pt-0.5">
        <span className="flex items-center gap-1 text-[10px] text-muted">
          <span className="inline-block h-2 w-2 rounded-sm ring-1 ring-highlight" />
          Today
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          <span className="inline-block h-2 w-2 rounded-sm bg-card-hover" />
          Log cook
        </span>
        <span className="flex items-center gap-1 text-[10px] text-text">
          <span className="inline-block h-2 w-2 rounded-sm bg-highlight/20" />
          Plan meal
        </span>
      </div>

      {/* Cook-log notes form (past/today) */}
      {action === "logging" && selected && (
        <form onSubmit={handleCookLog} className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-text">
            Logging for <span className="text-highlight">{fmtDisplayDate(selected)}</span>
          </p>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go? Any tweaks?"
            rows={3}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-highlight px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? "Saving…" : "Log Cook"}
            </button>
            <button type="button" onClick={() => { setAction("idle"); setSelected(null); }}
              className="text-xs text-muted hover:text-text transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Meal-plan confirmation (future dates) */}
      {action === "planning" && selected && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-text">
            Plan meal for <span className="text-highlight">{fmtDisplayDate(selected)}</span>?
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleMealPlan(selected)}
              className="rounded-lg bg-highlight px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => { setAction("idle"); setSelected(null); }}
              className="text-xs text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <p className={cn(
          "text-xs font-medium",
          action === "success" ? "text-highlight" : "text-destructive",
        )}>
          {action === "success" && "✓ "}{feedback}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main drawer
// ---------------------------------------------------------------------------

export function RecipePreviewDrawer({
  recipeId,
  onClose,
}: {
  recipeId: string;
  onClose: () => void;
}) {
  const [recipe, setRecipe]         = useState<DrawerRecipe | null>(null);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [visible, setVisible]         = useState(false);    // drives enter animation
  const [showCal, setShowCal]         = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  type ListStatus = "checking" | "idle" | "adding" | "added";
  const [listStatus, setListStatus] = useState<ListStatus>("checking");
  const calRef         = useRef<HTMLDivElement>(null);
  const moreIngRef     = useRef<HTMLButtonElement>(null);
  const scrollBodyRef  = useRef<HTMLDivElement>(null);

  // Fetch recipe data when drawer opens
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/recipes/${recipeId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.data) setRecipe(json.data as DrawerRecipe);
        else setFetchError("Couldn't load recipe.");
      })
      .catch(() => { if (!cancelled) setFetchError("Couldn't load recipe."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recipeId]);

  // Check whether this recipe's ingredients are already on the shopping list
  useEffect(() => {
    if (!recipe) return;
    setListStatus("checking");
    fetch(`/api/shopping/items?recipeId=${recipe.id}`)
      .then((r) => r.json())
      .then((json) => {
        const items = json.data?.items ?? [];
        setListStatus(items.length > 0 ? "added" : "idle");
      })
      .catch(() => setListStatus("idle"));
  }, [recipe]);

  async function handleAddToList() {
    if (!recipe || listStatus !== "idle") return;
    setListStatus("adding");
    const allIngs = recipe.ingredientGroups.flatMap((g) =>
      g.ingredients.map((i) => ({
        ingredientId: i.id,
        name: i.name,
        quantity: i.quantity ? parseFloat(i.quantity) : null,
        unit: i.unit ?? null,
      }))
    );
    try {
      await Promise.all(
        allIngs.map((ing) =>
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
    } catch {
      setListStatus("idle");
    }
  }

  // Trigger slide-in on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") handleClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280); // wait for exit animation
  }

  function toggleCal() {
    setShowCal((v) => !v);
    if (!showCal) {
      setTimeout(() => calRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }

  const INITIAL_COUNT  = 5;
  const allIngredients = recipe?.ingredientGroups.flatMap((g) => g.ingredients) ?? [];
  const shownIngredients = showAllIngredients ? allIngredients : allIngredients.slice(0, INITIAL_COUNT);
  const hiddenCount    = allIngredients.length - INITIAL_COUNT;
  const timeStr        = recipe ? formatTime(recipe.prepTimeMinutes, recipe.cookTimeMinutes) : "";

  function expandIngredients() {
    setShowAllIngredients(true);
    // Scroll the drawer body so the newly revealed ingredients are visible
    setTimeout(() => {
      moreIngRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px] transition-opacity duration-280",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* ── Drawer panel ─────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={recipe?.title ?? "Recipe preview"}
        className={cn(
          "fixed z-50 flex flex-col bg-card shadow-2xl",
          // Mobile: bottom sheet
          "inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t border-border",
          "transition-transform duration-280 ease-out",
          // Mobile animation: slide up
          !visible && "translate-y-full",
          visible && "translate-y-0",
          // Desktop: right panel — cancel the mobile max-height and stretch full viewport
          "md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:h-screen md:max-h-none md:w-[400px]",
          "md:rounded-none md:border-t-0 md:border-l md:border-border",
          // Desktop animation: slide in from right
          !visible && "md:translate-y-0 md:translate-x-full",
          visible && "md:translate-x-0",
        )}
      >
        {/* Mobile drag handle */}
        <div className="flex flex-shrink-0 justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* ── Scrollable body ──────────────────────────────────────── */}
        <div ref={scrollBodyRef} className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <DrawerSkeleton />
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <p className="text-sm text-muted">{fetchError}</p>
              <button type="button" onClick={handleClose}
                className="mt-4 text-sm text-highlight hover:opacity-80 transition-opacity">
                Close
              </button>
            </div>
          ) : recipe ? (
            <>
              {/* Photo */}
              <div className="relative w-full flex-shrink-0" style={{ paddingBottom: "56.25%" }}>
                <div className="absolute inset-0">
                  {recipe.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipe.photoUrl}
                      alt={recipe.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-card-hover">
                      <svg className="h-12 w-12 text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-1.5-.75m0-2.25a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13.5Z" />
                      </svg>
                    </div>
                  )}
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close preview"
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                {/* Title + meta */}
                <div>
                  <h2 className="text-xl font-bold text-text leading-tight">{recipe.title}</h2>

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    {recipe.cuisine && (
                      <span className="inline-flex items-center rounded-full border border-border bg-card-hover px-2.5 py-0.5 text-[11px] font-medium text-text">
                        {recipe.cuisine}
                      </span>
                    )}
                    {recipe.dishType && (
                      <span className="inline-flex items-center rounded-full border border-border bg-card-hover px-2.5 py-0.5 text-[11px] font-medium text-text">
                        {recipe.dishType}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <span
                        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COMPLEXITY_COLOR[recipe.complexity] ?? "#71717a" }}
                      />
                      {COMPLEXITY_LABEL[recipe.complexity] ?? recipe.complexity}
                    </span>
                    {timeStr && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {timeStr}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                {recipe.description && (
                  <div>
                    <p className={cn(
                      "text-sm leading-relaxed text-text/80",
                      !showFullDesc && "line-clamp-4",
                    )}>
                      {recipe.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowFullDesc((v) => !v)}
                      className="mt-1 text-xs font-medium text-highlight hover:opacity-80 transition-opacity"
                    >
                      {showFullDesc ? "See less" : "See more"}
                    </button>
                  </div>
                )}

                {/* Ingredients */}
                {allIngredients.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Ingredients
                    </p>
                    <ul className="space-y-1.5">
                      {shownIngredients.map((ing) => (
                        <li key={ing.id} className="flex items-baseline gap-1.5 text-sm text-text">
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted/60" />
                          {(ing.quantity || ing.unit) && (
                            <QtyUnit
                              quantity={ing.quantity}
                              unit={ing.unit}
                              className="text-muted tabular-nums"
                            />
                          )}
                          <span className="leading-snug">{ing.name}</span>
                          {ing.preparation && (
                            <span className="text-muted">, {ing.preparation}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {!showAllIngredients && hiddenCount > 0 && (
                      <button
                        ref={moreIngRef}
                        type="button"
                        onClick={expandIngredients}
                        className="mt-2.5 flex items-center gap-1 text-xs font-medium text-highlight hover:opacity-80 transition-opacity"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        {hiddenCount} more ingredient{hiddenCount !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                )}

                {/* Mini calendar (toggled) */}
                {showCal && (
                  <div ref={calRef}>
                    <MiniCalendar recipeId={recipe.id} />
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* ── Footer buttons ───────────────────────────────────────── */}
        {recipe && (
          <div className="flex-shrink-0 border-t border-border p-4 space-y-2.5">
            {/* Primary action */}
            <Link
              href={`/recipes/${recipe.id}`}
              className="flex w-full items-center justify-center rounded-xl bg-highlight px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              View Full Recipe
            </Link>

            {/* Secondary actions */}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleAddToList}
                disabled={listStatus === "checking" || listStatus === "adding" || listStatus === "added"}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors",
                  listStatus === "added"
                    ? "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400 cursor-default"
                    : listStatus === "adding" || listStatus === "checking"
                      ? "border-border bg-card text-muted cursor-wait"
                      : "border-border bg-card text-text hover:bg-card-hover",
                )}
              >
                {listStatus === "added" ? (
                  <>
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    </svg>
                    Added
                  </>
                ) : listStatus === "adding" ? (
                  "Adding…"
                ) : (
                  <>
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
                    </svg>
                    Add to List
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={toggleCal}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors",
                  showCal
                    ? "border-highlight bg-highlight/10 text-highlight"
                    : "border-border bg-card text-text hover:bg-card-hover",
                )}
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                Add to Calendar
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DrawerSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="w-full bg-card-hover" style={{ paddingBottom: "56.25%" }} />
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-3/4 rounded-lg bg-card-hover" />
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-full bg-card-hover" />
            <div className="h-5 w-16 rounded-full bg-card-hover" />
            <div className="h-5 w-12 rounded-full bg-card-hover" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-3.5 w-full rounded bg-card-hover" />
          <div className="h-3.5 w-5/6 rounded bg-card-hover" />
          <div className="h-3.5 w-4/6 rounded bg-card-hover" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-card-hover" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-card-hover mt-1 flex-shrink-0" />
              <div className="h-3 rounded bg-card-hover flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
