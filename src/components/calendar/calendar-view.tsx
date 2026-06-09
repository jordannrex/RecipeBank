"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CalendarEvent, PickerRecipe, MenuBand } from "@/types/calendar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "day" | "week" | "month";

// ---------------------------------------------------------------------------
// Date helpers — all local-timezone-safe, no external dependencies
// ---------------------------------------------------------------------------

function localToday(): string {
  const d = new Date();
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function isFuture(dateStr: string): boolean {
  return dateStr > localToday();
}

/** Returns the 7 YYYY-MM-DD strings for the Sunday-starting week that contains anchorDate. */
function getWeekDates(anchorDate: string): string[] {
  const d = parseDate(anchorDate);
  d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return fmtDate(day.getFullYear(), day.getMonth() + 1, day.getDate());
  });
}

/** Which unique {year,month} pairs do these dates touch? */
function monthsForDates(dates: string[]): { year: number; month: number }[] {
  const seen = new Set<string>();
  const result: { year: number; month: number }[] = [];
  for (const d of dates) {
    const [y, m] = d.split("-").map(Number);
    const key = `${y}-${m}`;
    if (!seen.has(key)) { seen.add(key); result.push({ year: y, month: m }); }
  }
  return result;
}

/** Build the 42-cell grid for a given year/month (month is 1-indexed). */
function buildMonthGrid(year: number, month: number) {
  const firstDow      = new Date(year, month - 1, 1).getDay();
  const daysInMonth   = new Date(year, month, 0).getDate();
  const daysInPrevMon = new Date(year, month - 1, 0).getDate();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;

  const cells: { dateStr: string; isCurrentMonth: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ dateStr: fmtDate(prevYear, prevMonth, daysInPrevMon - i), isCurrentMonth: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ dateStr: fmtDate(year, month, d), isCurrentMonth: true });
  for (let d = 1; cells.length < 42; d++)
    cells.push({ dateStr: fmtDate(nextYear, nextMonth, d), isCurrentMonth: false });
  return cells;
}

function formatDisplayDate(dateStr: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts);
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DOW_LABELS    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DOW_FULL      = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const BAND_COLORS   = ["bg-highlight/5", "bg-blue-500/5", "bg-purple-500/5"];

// ---------------------------------------------------------------------------
// Event detail modal — small popup shown when clicking any event
// ---------------------------------------------------------------------------

function EventDetailModal({
  event,
  onClose,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const today        = localToday();
  const isCookLog    = event.type === "cook-log";
  const isMenuRecipe = event.type === "menu-recipe";
  const isSolid      = isCookLog || (isMenuRecipe && event.date <= today);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const displayDate = formatDisplayDate(event.date, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const [noteText, setNoteText]     = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function handleSaveNote() {
    if (!event.menuId || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await fetch(`/api/menus/${event.menuId}/items/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText.trim() }),
      });
      onClose();
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Recipe photo */}
        {event.recipePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.recipePhotoUrl}
            alt={event.recipeTitle}
            className="w-full object-cover"
            style={{ maxHeight: "200px" }}
          />
        ) : (
          <div className={cn(
            "w-full h-28 flex items-center justify-center",
            isSolid ? "bg-highlight/10" : "bg-border/20",
          )}>
            <svg className="h-10 w-10 text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-1.5-.75m0-2.25a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13.5Z" />
            </svg>
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Type badge + close */}
          <div className="flex items-center justify-between">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              isSolid ? "bg-highlight/10 text-highlight" : "bg-border/40 text-muted",
            )}>
              {isSolid ? (
                <>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Cook Log
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Planned Meal
                </>
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-muted hover:bg-card-hover hover:text-text transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Title */}
          <div>
            <p className="text-lg font-bold text-text leading-snug">{event.recipeTitle}</p>
            <p className="text-xs text-muted mt-0.5">{displayDate}</p>
          </div>

          {/* Notes */}
          {isMenuRecipe ? (
            event.notes ? (
              <div className="rounded-lg bg-background border border-border/60 px-3 py-2.5">
                <p className="text-xs font-medium text-muted mb-1">Cook notes</p>
                <p className="text-sm text-text leading-relaxed">{event.notes}</p>
              </div>
            ) : event.date < today ? (
              <div className="space-y-1.5">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add notes about how it went…"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
                />
                <button type="button" onClick={handleSaveNote} disabled={savingNote || !noteText.trim()}
                  className="rounded-lg bg-highlight px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {savingNote ? "Saving…" : "Save note"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">No notes yet</p>
            )
          ) : (
            isCookLog && event.notes && (
              <div className="rounded-lg bg-background border border-border/60 px-3 py-2.5">
                <p className="text-xs font-medium text-muted mb-1">Notes</p>
                <p className="text-sm text-text leading-relaxed">{event.notes}</p>
              </div>
            )
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <Link
              href={`/recipes/${event.recipeId}`}
              className="flex items-center gap-1.5 text-sm font-medium text-highlight hover:opacity-80 transition-opacity"
            >
              View Recipe
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            {isMenuRecipe ? (
              <Link href="/menus"
                className="flex items-center gap-1 text-xs text-muted hover:text-text transition-colors"
                onClick={onClose}
              >
                Edit menu →
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => { onDelete(event); onClose(); }}
                className="flex items-center gap-1 text-xs text-muted hover:text-destructive transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="m19 7-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                </svg>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: EventChip (used in month + week cells)
// ---------------------------------------------------------------------------

function EventChip({
  event,
  onView,
  onDelete,
}: {
  event: CalendarEvent;
  onView: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const isMenuRecipe = event.type === "menu-recipe";
  // Menu recipes look like a cook log if in the past, planned meal if future
  const isSolid = event.type === "cook-log" || (isMenuRecipe && event.date <= localToday());
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-tight select-none",
        isSolid
          ? "bg-highlight text-white"
          : "border border-highlight/50 bg-highlight/10 text-highlight",
      )}
    >
      {/* Clickable label — opens detail modal */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onView(event); }}
        className="min-w-0 flex-1 truncate font-medium text-left hover:opacity-80 transition-opacity cursor-pointer"
        title={event.notes ? `${event.recipeTitle}: ${event.notes}` : event.recipeTitle}
      >
        {event.recipeTitle}
      </button>
      {/* × delete button — hidden for menu recipes */}
      {!isMenuRecipe && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(event); }}
          aria-label={`Remove ${event.recipeTitle}`}
          className="ml-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-80"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekEventBlock — expands to fill the day column; scales down with count
// ---------------------------------------------------------------------------

function WeekEventBlock({
  event,
  totalCount,
  onView,
  onDelete,
}: {
  event: CalendarEvent;
  totalCount: number;
  onView: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const isMenuRecipe = event.type === "menu-recipe";
  const isSolid      = event.type === "cook-log" || (isMenuRecipe && event.date <= localToday());

  // 3+ events: compact pill (same as before)
  if (totalCount >= 3) {
    return <EventChip event={event} onView={onView} onDelete={onDelete} />;
  }

  // 1–2 events: expanded card that fills available column height via flex-1
  return (
    <div
      className={cn(
        "group relative flex-1 flex flex-col rounded-lg overflow-hidden cursor-pointer min-h-0 transition-opacity hover:opacity-90",
        isSolid ? "bg-highlight" : "border border-highlight/40 bg-highlight/10",
      )}
      onClick={() => onView(event)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onView(event); }}
      aria-label={`View details for ${event.recipeTitle}`}
    >
      {/* Image area — only when this is the sole event */}
      {totalCount === 1 && (
        event.recipePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.recipePhotoUrl}
            alt=""
            className="w-full flex-1 object-cover min-h-0"
          />
        ) : (
          <div className={cn(
            "flex-1 flex items-center justify-center min-h-0",
            isSolid ? "bg-white/10" : "bg-highlight/5",
          )}>
            <svg
              className={cn("h-7 w-7", isSolid ? "text-white/25" : "text-highlight/25")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-1.5-.75m0-2.25a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13.5Z" />
            </svg>
          </div>
        )
      )}

      {/* Title + type label */}
      <div className={cn(
        "px-2 flex-shrink-0",
        totalCount === 2 ? "flex flex-col justify-center flex-1 py-2" : "py-1.5",
      )}>
        <p className={cn(
          "font-semibold truncate leading-tight",
          isSolid ? "text-white" : "text-highlight",
          totalCount === 1 ? "text-[11px]" : "text-xs",
        )}>
          {event.recipeTitle}
        </p>
        <p className={cn(
          "text-[10px] mt-0.5 truncate",
          isSolid ? "text-white/60" : "text-highlight/60",
        )}>
          {event.type === "cook-log" ? "Cook Log" : isSolid ? "Cook Log" : "Planned Meal"}
        </p>
      </div>

      {/* Delete button — absolute, appears on hover; hidden for menu recipes */}
      {!isMenuRecipe && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(event); }}
          aria-label={`Remove ${event.recipeTitle}`}
          className={cn(
            "absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
            isSolid
              ? "bg-black/25 text-white hover:bg-black/40"
              : "bg-highlight/15 text-highlight hover:bg-highlight/30",
          )}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthEventBlock — expands to fill the cell when alone; compact when stacked
// ---------------------------------------------------------------------------

function MonthEventBlock({
  event,
  totalCount,
  onView,
  onDelete,
}: {
  event: CalendarEvent;
  totalCount: number;
  onView: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const isMenuRecipe = event.type === "menu-recipe";
  const isSolid      = event.type === "cook-log" || (isMenuRecipe && event.date <= localToday());

  // 1 event: photo card filling the available cell space
  if (totalCount === 1) {
    return (
      <div
        className={cn(
          "group relative flex flex-col rounded overflow-hidden cursor-pointer transition-opacity hover:opacity-90",
          isSolid ? "bg-highlight" : "border border-highlight/40 bg-highlight/10",
        )}
        onClick={() => onView(event)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onView(event); }}
        aria-label={`View details for ${event.recipeTitle}`}
      >
        {event.recipePhotoUrl ? (
          // Fixed thumbnail height so a tall photo can't stretch the cell/row.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.recipePhotoUrl}
            alt=""
            className="h-14 w-full flex-shrink-0 object-cover"
          />
        ) : (
          <div className={cn(
            "h-14 flex-shrink-0",
            isSolid ? "bg-white/10" : "bg-highlight/5",
          )} />
        )}
        <div className="px-1.5 py-1 flex-shrink-0">
          <p className={cn(
            "text-[10px] font-semibold leading-tight truncate",
            isSolid ? "text-white" : "text-highlight",
          )}>
            {event.recipeTitle}
          </p>
        </div>
        {!isMenuRecipe && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(event); }}
            aria-label={`Remove ${event.recipeTitle}`}
            className={cn(
              "absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
              isSolid ? "bg-black/25 text-white" : "bg-highlight/15 text-highlight",
            )}
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // 2+ events: compact full-width pill (identical to EventChip but always full-width)
  return (
    <div className={cn(
      "group flex items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-tight select-none",
      isSolid ? "bg-highlight text-white" : "border border-highlight/50 bg-highlight/10 text-highlight",
    )}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onView(event); }}
        className="min-w-0 flex-1 truncate font-medium text-left hover:opacity-80 transition-opacity cursor-pointer"
        title={event.notes ? `${event.recipeTitle}: ${event.notes}` : event.recipeTitle}
      >
        {event.recipeTitle}
      </button>
      {!isMenuRecipe && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(event); }}
          aria-label={`Remove ${event.recipeTitle}`}
          className="ml-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-80"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: EventCard (used in day view — larger, clickable to open detail)
// ---------------------------------------------------------------------------

function EventCard({
  event,
  onView,
  onDelete,
}: {
  event: CalendarEvent;
  onView: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const isMenuRecipe = event.type === "menu-recipe";
  const isSolid      = event.type === "cook-log" || (isMenuRecipe && event.date <= localToday());
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors hover:opacity-90",
        isSolid ? "border-highlight/30 bg-highlight/8" : "border-highlight/40 bg-highlight/10",
      )}
      onClick={() => onView(event)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onView(event); }}
      aria-label={`View details for ${event.recipeTitle}`}
    >
      {event.recipePhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.recipePhotoUrl} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0 mt-0.5" />
      ) : (
        <div className={cn("h-10 w-10 rounded-lg flex-shrink-0 mt-0.5", isSolid ? "bg-highlight/20" : "bg-highlight/15")} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{event.recipeTitle}</p>
        <p className={cn("text-xs text-highlight", isSolid ? "opacity-100" : "opacity-70")}>
          {event.type === "cook-log" ? "Cook Log" : isSolid ? "Cook Log" : "Planned Meal"}
        </p>
        {event.notes && (
          <p className="mt-1 text-xs text-muted line-clamp-2">{event.notes}</p>
        )}
      </div>
      {!isMenuRecipe && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(event); }}
          aria-label={`Remove ${event.recipeTitle}`}
          className="flex-shrink-0 text-muted hover:text-destructive transition-colors mt-0.5"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe Picker panel (same for all views)
// ---------------------------------------------------------------------------

function RecipePicker({
  targetDate,
  onClose,
  onEventCreated,
}: {
  targetDate: string;
  onClose: () => void;
  onEventCreated: (event: CalendarEvent) => void;
}) {
  const future = isFuture(targetDate);
  const [query, setQuery]                     = useState("");
  const [recipes, setRecipes]                 = useState<PickerRecipe[]>([]);
  const [loadingRecipes, setLoadingRecipes]   = useState(true);
  const [selectedRecipe, setSelectedRecipe]   = useState<PickerRecipe | null>(null);
  const [notes, setNotes]                     = useState("");
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const displayDate = formatDisplayDate(targetDate, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  useEffect(() => {
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
  }, [query]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleRecipeSelect(recipe: PickerRecipe) {
    if (future) {
      setSubmitting(true); setError(null);
      try {
        const res  = await fetch("/api/meal-plans", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId: recipe.id, plannedDate: targetDate }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed"); return; }
        onEventCreated(json.data as CalendarEvent);
        onClose();
      } catch { setError("Something went wrong."); }
      finally { setSubmitting(false); }
    } else {
      setSelectedRecipe(recipe); setNotes(""); setError(null);
    }
  }

  async function handleCookLogSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRecipe) return;
    setSubmitting(true); setError(null);
    try {
      const res  = await fetch(`/api/recipes/${selectedRecipe.id}/cook-log`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookedAt: targetDate, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed"); return; }
      const log = json.data as { id: string; notes: string | null };
      onEventCreated({
        id: log.id, type: "cook-log",
        recipeId: selectedRecipe.id, recipeTitle: selectedRecipe.title,
        recipePhotoUrl: selectedRecipe.photoUrl,
        date: targetDate, notes: log.notes,
      });
      onClose();
    } catch { setError("Something went wrong."); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-3xl h-[82vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 flex-shrink-0">
          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wide">
              {future ? "Plan a meal" : "Log a cook"}
            </p>
            <h2 className="text-base font-semibold text-text">{displayDate}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-lg p-1.5 text-muted hover:bg-card-hover hover:text-text transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {selectedRecipe ? (
          /* Cook log form */
          <form onSubmit={handleCookLogSubmit} className="flex flex-col flex-1 overflow-y-auto p-5 gap-4">
            <button type="button" onClick={() => setSelectedRecipe(null)}
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-left hover:bg-card-hover transition-colors w-full">
              {selectedRecipe.photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={selectedRecipe.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                : <div className="h-10 w-10 rounded-lg bg-border flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text truncate">{selectedRecipe.title}</p>
                <p className="text-xs text-muted">Tap to choose a different recipe</p>
              </div>
            </button>
            <div>
              <label htmlFor="cal-cook-notes" className="block text-sm font-medium text-text mb-1">
                How did it go? <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea id="cal-cook-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="How did it go? Any tweaks?" rows={4} autoFocus
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center gap-3 mt-auto">
              <button type="submit" disabled={submitting}
                className="rounded-lg bg-highlight px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                {submitting ? "Saving…" : "Save Cook Log"}
              </button>
              <button type="button" onClick={() => { setSelectedRecipe(null); setError(null); }}
                className="text-sm text-muted hover:text-text transition-colors">
                Back
              </button>
            </div>
          </form>
        ) : (
          /* Recipe list */
          <>
            <div className="border-b border-border px-4 py-3 flex-shrink-0">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input ref={searchRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search recipes…"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20" />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingRecipes ? (
                <div className="flex flex-col gap-2 p-4">
                  {[1,2,3,4,5].map((n) => (
                    <div key={n} className="flex items-center gap-3 p-3">
                      <div className="h-12 w-12 rounded-lg bg-border animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-2/3 rounded bg-border/70 animate-pulse" />
                        <div className="h-3 w-1/3 rounded bg-border/50 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recipes.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted">
                  {query ? `No recipes matching "${query}"` : "No recipes yet."}
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {recipes.map((recipe) => (
                    <li key={recipe.id}>
                      <button type="button" disabled={submitting} onClick={() => handleRecipeSelect(recipe)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card-hover disabled:opacity-50">
                        {recipe.photoUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={recipe.photoUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                          : <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-border/40">
                              <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-1.5-.75m0-2.25a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13.5Z" />
                              </svg>
                            </div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text truncate">{recipe.title}</p>
                          {(recipe.cuisine || recipe.dishType) && (
                            <p className="text-xs text-muted truncate">
                              {[recipe.cuisine, recipe.dishType].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <svg className="h-4 w-4 flex-shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                          <path d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-border px-4 py-2.5 flex-shrink-0">
              <p className="text-xs text-muted text-center">
                {future ? "Select a recipe to add it as a planned meal" : "Select a recipe to log a cook session"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month view — compact 7-col grid
// ---------------------------------------------------------------------------

function MonthCell({
  dateStr, isCurrentMonth, events, today, onAdd, onViewEvent, onDeleteEvent, menuBands,
}: {
  dateStr: string; isCurrentMonth: boolean; events: CalendarEvent[];
  today: string; onAdd: (d: string) => void;
  onViewEvent: (e: CalendarEvent) => void; onDeleteEvent: (e: CalendarEvent) => void;
  menuBands: MenuBand[];
}) {
  const isToday  = dateStr === today;
  const dayNum   = Number(dateStr.split("-")[2]);
  const MAX_SHOW = 3;
  const shown    = events.slice(0, MAX_SHOW);
  const overflow = events.length - MAX_SHOW;

  const activeBands      = menuBands.filter((b) => dateStr >= b.startDate && dateStr <= b.endDate);
  const bandColorIdx     = activeBands.length > 0 ? menuBands.indexOf(activeBands[0]) % BAND_COLORS.length : -1;
  const bandColor        = bandColorIdx >= 0 ? BAND_COLORS[bandColorIdx] : null;
  const isFirstDayOfBand = activeBands.length > 0 && dateStr === activeBands[0].startDate;

  return (
    <div className={cn(
      "relative min-h-[110px] border-b border-r border-border/50 p-1.5 group flex flex-col",
      !isCurrentMonth && "bg-card/30",
      bandColor,
    )}>
      {/* Band label on first day */}
      {isFirstDayOfBand && (
        <span className="mb-0.5 inline-block truncate rounded px-1 py-0 text-[9px] font-semibold text-highlight/80 bg-highlight/10 leading-tight flex-shrink-0">
          {activeBands[0].title}
        </span>
      )}
      <div className="flex items-center justify-between mb-1 flex-shrink-0">
        <span className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
          isToday ? "bg-highlight text-white" : isCurrentMonth ? "text-text" : "text-muted/40",
        )}>
          {dayNum}
        </span>
        {isCurrentMonth && (
          <button type="button" onClick={() => onAdd(dateStr)} aria-label={`Add to ${dateStr}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-highlight/10 hover:text-highlight">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      {/* Events area: compact, fixed-height thumbnails so cells stay uniform */}
      <div className="flex flex-col gap-0.5 min-h-0">
        {shown.map((ev) => (
          <MonthEventBlock
            key={ev.id}
            event={ev}
            totalCount={events.length}
            onView={onViewEvent}
            onDelete={onDeleteEvent}
          />
        ))}
        {overflow > 0 && <span className="text-xs text-muted px-1.5">+{overflow} more</span>}
      </div>
    </div>
  );
}

function MonthView({
  year, month, events, today, onAdd, onViewEvent, onDeleteEvent, menuBands,
}: {
  year: number; month: number; events: CalendarEvent[]; today: string;
  onAdd: (d: string) => void;
  onViewEvent: (e: CalendarEvent) => void; onDeleteEvent: (e: CalendarEvent) => void;
  menuBands: MenuBand[];
}) {
  const grid = buildMonthGrid(year, month);
  const byDate = groupByDate(events);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-card">
        {DOW_LABELS.map((dow) => (
          <div key={dow} className="border-r border-border/50 px-2 py-2 text-center last:border-r-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{dow}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((cell, i) => (
          <MonthCell key={i} {...cell}
            events={byDate.get(cell.dateStr) ?? []}
            today={today} onAdd={onAdd} onViewEvent={onViewEvent} onDeleteEvent={onDeleteEvent}
            menuBands={menuBands} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week view — 7 columns with more space per day
// ---------------------------------------------------------------------------

function WeekDayColumn({
  dateStr, events, today, onAdd, onViewEvent, onDeleteEvent, menuBands,
}: {
  dateStr: string; events: CalendarEvent[]; today: string;
  onAdd: (d: string) => void;
  onViewEvent: (e: CalendarEvent) => void; onDeleteEvent: (e: CalendarEvent) => void;
  menuBands: MenuBand[];
}) {
  const isToday = dateStr === today;
  const [, m, d] = dateStr.split("-").map(Number);
  const dow = parseDate(dateStr).getDay();

  const activeBands  = menuBands.filter((b) => dateStr >= b.startDate && dateStr <= b.endDate);
  const bandColor    = activeBands.length > 0 ? BAND_COLORS[menuBands.indexOf(activeBands[0]) % BAND_COLORS.length] : null;
  const isFirstDay   = activeBands.length > 0 && dateStr === activeBands[0].startDate;

  return (
    <div className={cn("flex flex-col border-r border-border/50 last:border-r-0", bandColor)}>
      {/* Column header */}
      <div className={cn(
        "flex flex-col items-center gap-0.5 border-b border-border/50 px-2 py-2",
        isToday && "bg-highlight/5",
      )}>
        {isFirstDay && (
          <span className="mb-0.5 truncate rounded px-1 text-[9px] font-semibold text-highlight/80 bg-highlight/10 leading-tight max-w-full">
            {activeBands[0].title}
          </span>
        )}
        <span className={cn("text-xs font-semibold uppercase tracking-wide",
          isToday ? "text-highlight" : "text-muted")}>
          {DOW_LABELS[dow]}
        </span>
        <span className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
          isToday ? "bg-highlight text-white" : "text-text",
        )}>
          {d}
        </span>
        <span className="text-[10px] text-muted/60">{MONTH_NAMES[m - 1].slice(0, 3)}</span>
      </div>

      {/* Events + Add — inner events-div is flex-1 so expanded blocks fill height */}
      <div className="flex flex-1 flex-col p-1.5 min-h-[180px] group">
        <div className="flex flex-col gap-1 flex-1 min-h-0">
          {events.map((ev) => (
            <WeekEventBlock
              key={ev.id}
              event={ev}
              totalCount={events.length}
              onView={onViewEvent}
              onDelete={onDeleteEvent}
            />
          ))}
        </div>
        <button type="button" onClick={() => onAdd(dateStr)} aria-label={`Add to ${dateStr}`}
          className="flex-shrink-0 mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-highlight/5 hover:text-highlight">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
        </button>
      </div>
    </div>
  );
}

function WeekView({
  weekDates, events, today, onAdd, onViewEvent, onDeleteEvent, menuBands,
}: {
  weekDates: string[]; events: CalendarEvent[]; today: string;
  onAdd: (d: string) => void;
  onViewEvent: (e: CalendarEvent) => void; onDeleteEvent: (e: CalendarEvent) => void;
  menuBands: MenuBand[];
}) {
  const byDate = groupByDate(events);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7">
        {weekDates.map((dateStr) => (
          <WeekDayColumn key={dateStr} dateStr={dateStr}
            events={byDate.get(dateStr) ?? []}
            today={today} onAdd={onAdd} onViewEvent={onViewEvent} onDeleteEvent={onDeleteEvent}
            menuBands={menuBands} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day view — single-column detail
// ---------------------------------------------------------------------------

function DayView({
  dateStr, events, today, onAdd, onViewEvent, onDeleteEvent,
}: {
  dateStr: string; events: CalendarEvent[]; today: string;
  onAdd: (d: string) => void;
  onViewEvent: (e: CalendarEvent) => void; onDeleteEvent: (e: CalendarEvent) => void;
}) {
  const isToday   = dateStr === today;
  const dayEvents = events.filter((e) => e.date === dateStr);
  const dow       = parseDate(dateStr).getDay();

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Day header */}
      <div className={cn(
        "flex items-center justify-between border-b border-border px-5 py-4",
        isToday && "bg-highlight/5",
      )}>
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-wide",
            isToday ? "text-highlight" : "text-muted")}>
            {isToday ? "Today" : DOW_FULL[dow]}
          </p>
          <p className="text-xl font-bold text-text">
            {formatDisplayDate(dateStr, { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <button type="button" onClick={() => onAdd(dateStr)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-text hover:bg-card-hover transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {isFuture(dateStr) ? "Plan meal" : "Log cook"}
        </button>
      </div>

      {/* Events */}
      <div className="p-4">
        {dayEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <svg className="h-8 w-8 text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <p className="text-sm text-muted">Nothing planned for this day</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((ev) => (
              <EventCard key={ev.id} event={ev} onView={onViewEvent} onDelete={onDeleteEvent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: group events by date
// ---------------------------------------------------------------------------

function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    if (!map.has(ev.date)) map.set(ev.date, []);
    map.get(ev.date)!.push(ev);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function MonthSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-card">
        {DOW_LABELS.map((d) => (
          <div key={d} className="border-r border-border/50 px-2 py-2 text-center last:border-r-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="min-h-[110px] border-b border-r border-border/50 p-1.5">
            <div className="h-5 w-5 rounded-full bg-border/30 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-r border-border/50 last:border-r-0">
            <div className="flex flex-col items-center gap-1 border-b border-border/50 py-3">
              <div className="h-3 w-6 rounded bg-border/40 animate-pulse" />
              <div className="h-7 w-7 rounded-full bg-border/30 animate-pulse" />
            </div>
            <div className="p-2 min-h-[180px] space-y-1">
              <div className="h-5 rounded bg-border/20 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DaySkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border px-5 py-4">
        <div className="h-3 w-12 rounded bg-border/40 animate-pulse mb-1" />
        <div className="h-7 w-48 rounded bg-border/30 animate-pulse" />
      </div>
      <div className="p-4 space-y-2">
        {[1, 2].map((n) => (
          <div key={n} className="h-16 rounded-xl bg-border/20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CalendarView
// ---------------------------------------------------------------------------

export function CalendarView() {
  const today = localToday();

  // Single anchor date drives all three views
  const [anchorDate, setAnchorDate]     = useState(today);
  const [viewMode, setViewMode]         = useState<ViewMode>("week");
  const [events, setEvents]             = useState<CalendarEvent[]>([]);
  const [menuBands, setMenuBands]       = useState<MenuBand[]>([]);
  const [loading, setLoading]           = useState(true);
  const [pickerDate, setPickerDate]     = useState<string | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);

  // Compute the dates visible in the current view
  const visibleDates: string[] = (() => {
    if (viewMode === "day") return [anchorDate];
    if (viewMode === "week") return getWeekDates(anchorDate);
    // Month: all 42 cells
    const [y, m] = anchorDate.split("-").map(Number);
    return buildMonthGrid(y, m).map((c) => c.dateStr);
  })();

  // Fetch all months touched by the visible dates
  const loadEvents = useCallback(async (dates: string[]) => {
    setLoading(true);
    try {
      const months = monthsForDates(dates);
      const results = await Promise.all(
        months.map(({ year, month }) =>
          fetch(`/api/calendar?year=${year}&month=${month}`)
            .then((r) => r.json())
            .then((json) => ({
              events:    (json.data?.events    ?? []) as CalendarEvent[],
              menuBands: (json.data?.menuBands ?? []) as MenuBand[],
            }))
        )
      );
      // Merge + deduplicate events by id
      const mergedEvents = new Map<string, CalendarEvent>();
      for (const { events: evts } of results) for (const ev of evts) mergedEvents.set(ev.id, ev);
      setEvents(Array.from(mergedEvents.values()));

      // Merge + deduplicate menuBands by menuId
      const mergedBands = new Map<string, MenuBand>();
      for (const { menuBands: bands } of results) for (const b of bands) mergedBands.set(b.menuId, b);
      setMenuBands(Array.from(mergedBands.values()));
    } catch {
      setEvents([]);
      setMenuBands([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Key on view mode + anchor date to re-fetch when either changes
  const fetchKey = viewMode === "day"
    ? `day:${anchorDate}`
    : viewMode === "week"
      ? `week:${getWeekDates(anchorDate)[0]}`
      : `month:${anchorDate.slice(0, 7)}`;

  useEffect(() => { loadEvents(visibleDates); }, [fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation — each view steps by a different unit
  function prev() {
    if (viewMode === "day") { setAnchorDate(addDays(anchorDate, -1)); return; }
    if (viewMode === "week") { setAnchorDate(addDays(anchorDate, -7)); return; }
    // Month
    const [y, m] = anchorDate.split("-").map(Number);
    const nm = m === 1 ? 12 : m - 1;
    const ny = m === 1 ? y - 1 : y;
    setAnchorDate(fmtDate(ny, nm, 1));
  }
  function next() {
    if (viewMode === "day") { setAnchorDate(addDays(anchorDate, 1)); return; }
    if (viewMode === "week") { setAnchorDate(addDays(anchorDate, 7)); return; }
    const [y, m] = anchorDate.split("-").map(Number);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    setAnchorDate(fmtDate(ny, nm, 1));
  }
  function goToday() { setAnchorDate(today); }

  // Is the current view showing "today" (so we can hide the Today button)
  const isShowingToday = (() => {
    if (viewMode === "day") return anchorDate === today;
    if (viewMode === "week") return getWeekDates(anchorDate).includes(today);
    const [y, m] = anchorDate.split("-").map(Number);
    const [ty, tm] = today.split("-").map(Number);
    return y === ty && m === tm;
  })();

  // Title label for the navigation header
  const navLabel = (() => {
    if (viewMode === "day") {
      return formatDisplayDate(anchorDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    if (viewMode === "week") {
      const week = getWeekDates(anchorDate);
      const start = week[0]; const end = week[6];
      const [, sm, sd] = start.split("-").map(Number);
      const [ey, em, ed] = end.split("-").map(Number);
      const startLabel = `${MONTH_NAMES[sm - 1].slice(0, 3)} ${sd}`;
      const endLabel   = sm === em
        ? `${ed}`
        : `${MONTH_NAMES[em - 1].slice(0, 3)} ${ed}`;
      return `${startLabel} – ${endLabel}, ${ey}`;
    }
    const [y, m] = anchorDate.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  })();

  function handleEventCreated(event: CalendarEvent) {
    setEvents((prev) => [...prev, event]);
  }

  async function handleDeleteEvent(event: CalendarEvent) {
    // Menu recipe events are managed via the Menus page, not removed from the calendar directly
    if (event.type === "menu-recipe") {
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    try {
      if (event.type === "cook-log") {
        await fetch(`/api/recipes/${event.recipeId}/cook-log/${event.id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/meal-plans/${event.id}`, { method: "DELETE" });
      }
    } catch {
      setEvents((prev) => [...prev, event]); // revert
    }
  }

  // Filter events to only those visible in the current view/anchor
  const visibleSet = new Set(visibleDates);
  const visibleEvents = events.filter((e) => visibleSet.has(e.date));

  const [anchorY, anchorM] = anchorDate.split("-").map(Number);
  const weekDates = viewMode === "week" ? getWeekDates(anchorDate) : [];

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-text">Meal Calendar</h1>
          {!isShowingToday && (
            <button type="button" onClick={goToday}
              className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-text hover:bg-card-hover transition-colors">
              Today
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {(["Day", "Week", "Month"] as const).map((label) => {
            const mode = label.toLowerCase() as ViewMode;
            return (
              <button key={label} type="button" onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  viewMode === mode ? "bg-text text-background shadow-sm" : "text-text/60 hover:text-text",
                )}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Navigation row ────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={prev} aria-label="Previous"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-text hover:bg-card-hover transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-text">{navLabel}</span>
        <button type="button" onClick={next} aria-label="Next"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-text hover:bg-card-hover transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-highlight" />
          <span className="text-xs text-muted">Cook Log</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-highlight/50 bg-highlight/10" />
          <span className="text-xs text-muted">Planned Meal</span>
        </div>
      </div>

      {/* ── View content ──────────────────────────────────────────── */}
      {loading ? (
        viewMode === "month" ? <MonthSkeleton /> :
        viewMode === "week"  ? <WeekSkeleton />  : <DaySkeleton />
      ) : viewMode === "month" ? (
        <MonthView
          year={anchorY} month={anchorM}
          events={visibleEvents} today={today}
          onAdd={setPickerDate} onViewEvent={setViewingEvent} onDeleteEvent={handleDeleteEvent}
          menuBands={menuBands}
        />
      ) : viewMode === "week" ? (
        <WeekView
          weekDates={weekDates} events={visibleEvents} today={today}
          onAdd={setPickerDate} onViewEvent={setViewingEvent} onDeleteEvent={handleDeleteEvent}
          menuBands={menuBands}
        />
      ) : (
        <DayView
          dateStr={anchorDate} events={visibleEvents} today={today}
          onAdd={setPickerDate} onViewEvent={setViewingEvent} onDeleteEvent={handleDeleteEvent}
        />
      )}

      {/* ── Recipe picker ─────────────────────────────────────────── */}
      {pickerDate && (
        <RecipePicker
          targetDate={pickerDate}
          onClose={() => setPickerDate(null)}
          onEventCreated={handleEventCreated}
        />
      )}

      {/* ── Event detail modal ────────────────────────────────────── */}
      {viewingEvent && (
        <EventDetailModal
          event={viewingEvent}
          onClose={() => setViewingEvent(null)}
          onDelete={(ev) => { handleDeleteEvent(ev); setViewingEvent(null); }}
        />
      )}
    </div>
  );
}
