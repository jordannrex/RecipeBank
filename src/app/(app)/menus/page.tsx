"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { parseCost } from "@/lib/cost";
import { MenuPill } from "@/components/menus/menu-pill";
import { MenuDetailModal } from "@/components/menus/menu-detail-modal";
import { CreateMenuModal } from "@/components/menus/create-menu-modal";
import type { MenuDetail, MenuSummary } from "@/types/menu";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function MenuPillSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-5 w-40 rounded bg-border/40" />
          <div className="h-3.5 w-64 rounded bg-border/30" />
        </div>
        <div className="h-8 w-8 rounded-lg bg-border/30 flex-shrink-0" />
      </div>
      <div className="mt-2 h-5 w-20 rounded-full bg-border/20" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort + Filter types
// ---------------------------------------------------------------------------

type SortOption = "default" | "alpha" | "most-used" | "most-recipes" | "highest-cost";
type FilterOption = "all" | "past" | "planned";

// ---------------------------------------------------------------------------
// Menus page
// ---------------------------------------------------------------------------

export default function MenusPage() {
  const [menus, setMenus] = useState<MenuSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [viewingMenuId, setViewingMenuId] = useState<string | null>(null);
  const [viewingMenuMode, setViewingMenuMode] = useState<"view" | "edit">("view");

  // Sort + Filter state
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [filterOption, setFilterOption] = useState<FilterOption>("all");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/menus")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) { setError(json.error); return; }
        setMenus((json.data ?? []) as MenuSummary[]);
      })
      .catch(() => { if (!cancelled) setError("Failed to load menus."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortDropdownOpen(false);
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterDropdownOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleCreated(menu: MenuDetail) {
    setMenus((prev) => [menu, ...prev]);
  }

  function handleUpdated(updated: MenuSummary) {
    setMenus((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  async function handleDelete(id: string) {
    setMenus((prev) => prev.filter((m) => m.id !== id));
    setViewingMenuId(null);
    await fetch(`/api/menus/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // Filter + Sort logic
  // ---------------------------------------------------------------------------

  const isDefaultView = sortOption === "default" && filterOption === "all";

  function applyFilter(list: MenuSummary[]): MenuSummary[] {
    if (filterOption === "all") return list;
    if (filterOption === "past") return list.filter((m) => m.usageCount > 0);
    if (filterOption === "planned") return list.filter((m) => m.nextPlannedUsage !== null || m.currentUsage !== null);
    return list;
  }

  function applySort(list: MenuSummary[]): MenuSummary[] {
    if (sortOption === "default") {
      // Sort by updatedAt DESC
      return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    if (sortOption === "alpha") {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortOption === "most-used") {
      return [...list].sort((a, b) => b.usageCount - a.usageCount || a.title.localeCompare(b.title));
    }
    if (sortOption === "most-recipes") {
      return [...list].sort((a, b) => b.itemCount - a.itemCount || a.title.localeCompare(b.title));
    }
    if (sortOption === "highest-cost") {
      return [...list].sort((a, b) => {
        const ca = parseCost(a.totalCost);
        const cb = parseCost(b.totalCost);
        // Menus without a cost estimate sort to the bottom; ties broken by title.
        if (ca === null && cb === null) return a.title.localeCompare(b.title);
        if (ca === null) return 1;
        if (cb === null) return -1;
        return cb - ca || a.title.localeCompare(b.title);
      });
    }
    return list;
  }

  // Filtered + sorted flat list
  const processedMenus = applySort(applyFilter(menus));

  // For default view: split into current + others
  const currentMenus = isDefaultView ? menus.filter((m) => m.currentUsage !== null) : [];
  const otherMenus = isDefaultView
    ? applySort(menus.filter((m) => m.currentUsage === null))
    : [];

  const sortLabels: Record<SortOption, string> = {
    default: "Default",
    alpha: "Alphabetical",
    "most-used": "Most Used",
    "most-recipes": "Most Recipes",
    "highest-cost": "Highest Cost",
  };

  const filterLabels: Record<FilterOption, string> = {
    all: "All Menus",
    past: "Past Menus",
    planned: "Planned Menus",
  };

  const sortActive = sortOption !== "default";
  const filterActive = filterOption !== "all";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">Menus</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Menu
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => <MenuPillSkeleton key={n} />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : menus.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-16 text-center">
          <p className="text-lg font-semibold text-text">No menus yet</p>
          <p className="mt-1 text-sm text-muted">Create your first menu to organize your meal plans.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-lg bg-highlight px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Create your first menu
          </button>
        </div>
      ) : (
        <>
          {/* Sort + Filter toolbar */}
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div ref={sortRef} className="relative">
              <button
                type="button"
                onClick={() => { setSortDropdownOpen((v) => !v); setFilterDropdownOpen(false); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  sortActive
                    ? "border-highlight bg-highlight/10 text-highlight"
                    : "border-border bg-card text-text hover:bg-card-hover",
                )}
              >
                {sortActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-highlight" />
                )}
                Sort
                <svg className="h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {sortDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-xl border border-border bg-card py-1 shadow-lg">
                  {(Object.keys(sortLabels) as SortOption[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => { setSortOption(opt); setSortDropdownOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                        sortOption === opt ? "text-highlight font-semibold" : "text-text hover:bg-card-hover",
                      )}
                    >
                      {sortOption === opt && (
                        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <span className={sortOption === opt ? "" : "ml-5"}>{sortLabels[opt]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter dropdown */}
            <div ref={filterRef} className="relative">
              <button
                type="button"
                onClick={() => { setFilterDropdownOpen((v) => !v); setSortDropdownOpen(false); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  filterActive
                    ? "border-highlight bg-highlight/10 text-highlight"
                    : "border-border bg-card text-text hover:bg-card-hover",
                )}
              >
                {filterActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-highlight" />
                )}
                Filter
                <svg className="h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {filterDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-xl border border-border bg-card py-1 shadow-lg">
                  {(Object.keys(filterLabels) as FilterOption[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => { setFilterOption(opt); setFilterDropdownOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                        filterOption === opt ? "text-highlight font-semibold" : "text-text hover:bg-card-hover",
                      )}
                    >
                      {filterOption === opt && (
                        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <span className={filterOption === opt ? "" : "ml-5"}>{filterLabels[opt]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Menu list */}
          {isDefaultView ? (
            <div className="space-y-6">
              {/* Current menu section */}
              {currentMenus.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Current Menu</p>
                  {currentMenus.map((menu) => (
                    <MenuPill
                      key={menu.id}
                      menu={menu}
                      onClick={() => { setViewingMenuId(menu.id); setViewingMenuMode("view"); }}
                      onEdit={() => { setViewingMenuId(menu.id); setViewingMenuMode("edit"); }}
                      onDelete={() => handleDelete(menu.id)}
                    />
                  ))}
                </div>
              )}

              {/* Other menus section */}
              {otherMenus.length > 0 && (
                <div className="space-y-3">
                  {currentMenus.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Other Menus</p>
                  )}
                  {otherMenus.map((menu) => (
                    <MenuPill
                      key={menu.id}
                      menu={menu}
                      onClick={() => { setViewingMenuId(menu.id); setViewingMenuMode("view"); }}
                      onEdit={() => { setViewingMenuId(menu.id); setViewingMenuMode("edit"); }}
                      onDelete={() => handleDelete(menu.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Flat filtered/sorted list */
            <div className="space-y-3">
              {processedMenus.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center">
                  <p className="text-sm text-muted">No menus match this filter.</p>
                </div>
              ) : (
                processedMenus.map((menu) => (
                  <MenuPill
                    key={menu.id}
                    menu={menu}
                    onClick={() => { setViewingMenuId(menu.id); setViewingMenuMode("view"); }}
                    onEdit={() => { setViewingMenuId(menu.id); setViewingMenuMode("edit"); }}
                    onDelete={() => handleDelete(menu.id)}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateMenuModal
          onClose={() => setShowCreate(false)}
          onCreated={(menu) => { handleCreated(menu); setShowCreate(false); }}
        />
      )}

      {/* Detail modal */}
      {viewingMenuId && (
        <MenuDetailModal
          menuId={viewingMenuId}
          initialMode={viewingMenuMode}
          onClose={() => setViewingMenuId(null)}
          onUpdated={handleUpdated}
          onDeleted={(id) => handleDelete(id)}
        />
      )}
    </div>
  );
}
