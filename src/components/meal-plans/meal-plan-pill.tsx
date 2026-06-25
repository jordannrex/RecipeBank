"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MealPlanSummary } from "@/types/meal-plan";

function formatDateRange(startDate: string, endDate: string | null): string {
  const fmtOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const startLabel = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", fmtOpts);
  if (!endDate) return startLabel;
  const [ey, em, ed] = endDate.split("-").map(Number);
  const endLabel = new Date(ey, em - 1, ed).toLocaleDateString("en-US", fmtOpts);
  return `${startLabel} – ${endLabel}`;
}

/**
 * Split photos into display rows.
 * ≤ 5 items  → single row
 * > 5 items  → two rows; top row gets ceil(n/2), bottom gets floor(n/2)
 */
function buildPhotoRows(urls: (string | null)[]): (string | null)[][] {
  if (urls.length === 0) return [];
  if (urls.length <= 5) return [urls];
  const topCount = Math.ceil(urls.length / 2);
  return [urls.slice(0, topCount), urls.slice(topCount)];
}

function PhotoThumb({ url }: { url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-12 w-12 flex-shrink-0 rounded-xl object-cover sm:h-16 sm:w-16"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-border/40 sm:h-16 sm:w-16">
      <svg className="h-6 w-6 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-1.5-.75m0-2.25a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13.5Z" />
      </svg>
    </div>
  );
}

type Props = {
  mealPlan: MealPlanSummary;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function MealPlanPill({ mealPlan, onClick, onEdit, onDelete }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const photoRows = buildPhotoRows(mealPlan.recipePhotoUrls);

  // Subtitle: servings [· cost]
  const subtitleParts: string[] = [];
  subtitleParts.push(`${mealPlan.totalServings} serving${mealPlan.totalServings !== 1 ? "s" : ""}`);
  if (mealPlan.totalCost) {
    subtitleParts.push(`${mealPlan.isPartialCost ? "~" : ""}${mealPlan.totalCost}`);
  }

  // Date line
  let dateLine: { label: string; highlight: boolean } | null = null;
  if (mealPlan.currentUsage) {
    const dateStr = formatDateRange(mealPlan.currentUsage.startDate, mealPlan.currentUsage.endDate);
    dateLine = { label: `Current · ${dateStr}`, highlight: true };
  } else if (mealPlan.nextPlannedUsage) {
    const dateStr = formatDateRange(mealPlan.nextPlannedUsage.startDate, mealPlan.nextPlannedUsage.endDate);
    dateLine = { label: `Planned · ${dateStr}`, highlight: false };
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete();
  }

  const recipeCount = (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-border/40 px-2 py-0.5 text-xs text-muted whitespace-nowrap">
      {mealPlan.itemCount} recipe{mealPlan.itemCount !== 1 ? "s" : ""}
    </span>
  );

  return (
    <div
      className="relative cursor-pointer rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:bg-card-hover sm:px-5"
      onClick={onClick}
    >
      {/* Options dropdown — pinned to the top-right corner in both layouts */}
      <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <button
            type="button"
            onClick={() => { setDropdownOpen((v) => !v); setConfirmDelete(false); }}
            aria-label="Meal plan options"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-card-hover hover:text-text transition-colors"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => { setDropdownOpen(false); setConfirmDelete(false); }}
              />
              <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-xl border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setDropdownOpen(false); onEdit(); }}
                  className="block w-full px-4 py-2 text-left text-sm text-text hover:bg-card-hover transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className={cn(
                    "block w-full px-4 py-2 text-left text-sm transition-colors",
                    confirmDelete ? "text-destructive font-semibold" : "text-text hover:bg-card-hover",
                  )}
                >
                  {confirmDelete ? "Tap again to confirm" : "Delete"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stacks vertically on phones; becomes a row on `sm`+ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
        {/* Text content. pr-9 keeps it clear of the absolute options button. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pr-9 sm:pr-6">
          <p className="truncate text-base font-bold text-text">{mealPlan.title}</p>
          <p className="truncate text-sm text-muted">
            {subtitleParts.join(" · ")}
            {!mealPlan.totalCost && mealPlan.itemCount > 0 && (
              <span className="text-muted/60"> · No price data</span>
            )}
          </p>
          {dateLine && (
            <p className={cn("mt-0.5 truncate text-xs", dateLine.highlight ? "font-medium text-highlight" : "text-muted")}>
              {dateLine.label}
            </p>
          )}
          {mealPlan.description && (
            <p className="mt-0.5 truncate text-xs text-muted">{mealPlan.description}</p>
          )}
          {/* Recipe count — inline under the text on mobile only */}
          <div className="mt-1.5 sm:hidden">{recipeCount}</div>
        </div>

        {/* Photo grid — horizontally scrollable on mobile so it never squeezes
            the text; full grid on larger screens. */}
        {photoRows.length > 0 && (
          <div className="-mx-4 flex-shrink-0 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max flex-col gap-1.5 sm:w-auto">
              {photoRows.map((row, ri) => (
                <div key={ri} className="flex gap-1.5">
                  {row.map((url, pi) => (
                    <PhotoThumb key={pi} url={url} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recipe count — bottom-right column on desktop only */}
        <div className="hidden flex-shrink-0 items-end sm:flex">{recipeCount}</div>
      </div>
    </div>
  );
}
