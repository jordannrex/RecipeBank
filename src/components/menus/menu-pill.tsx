"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MenuSummary } from "@/types/menu";

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
        className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-border/40 flex items-center justify-center">
      <svg className="h-6 w-6 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-1.5-.75m0-2.25a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13.5Z" />
      </svg>
    </div>
  );
}

type Props = {
  menu: MenuSummary;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function MenuPill({ menu, onClick, onEdit, onDelete }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dateRange = formatDateRange(menu.startDate, menu.endDate);
  const photoRows = buildPhotoRows(menu.recipePhotoUrls);
  const hasTwoRows = photoRows.length === 2;

  const subtitleParts: string[] = [];
  if (dateRange) subtitleParts.push(dateRange);
  subtitleParts.push(`${menu.totalServings} serving${menu.totalServings !== 1 ? "s" : ""}`);
  if (menu.totalCost) {
    subtitleParts.push(`${menu.isPartialCost ? "~" : ""}${menu.totalCost}`);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete();
  }

  return (
    <div
      className="rounded-2xl border border-border bg-card px-5 py-4 cursor-pointer hover:bg-card-hover transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        {/* Left: text content */}
        <div className={cn("flex-1 min-w-0 flex flex-col justify-center", hasTwoRows ? "gap-0.5" : "gap-0.5")}>
          <p className="text-base font-bold text-text truncate">{menu.title}</p>
          <p className="text-sm text-muted truncate">
            {subtitleParts.join(" · ")}
            {!menu.totalCost && menu.itemCount > 0 && (
              <span className="text-muted/60"> · No price data</span>
            )}
          </p>
          {menu.description && (
            <p className="text-xs text-muted truncate mt-0.5">{menu.description}</p>
          )}
        </div>

        {/* Photo grid */}
        {photoRows.length > 0 && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {photoRows.map((row, ri) => (
              <div key={ri} className="flex gap-1.5">
                {row.map((url, pi) => (
                  <PhotoThumb key={pi} url={url} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Far right: dropdown + recipe count */}
        <div
          className="flex flex-col items-end justify-between flex-shrink-0 self-stretch py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Dropdown trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setDropdownOpen((v) => !v); setConfirmDelete(false); }}
              aria-label="Menu options"
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

          {/* Recipe count badge */}
          <span className="inline-flex items-center gap-1 rounded-full bg-border/40 px-2 py-0.5 text-xs text-muted whitespace-nowrap">
            {menu.itemCount} recipe{menu.itemCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
