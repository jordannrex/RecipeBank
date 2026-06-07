"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { RecipePreviewDrawer } from "@/components/recipes/recipe-preview-drawer";
import { AddRecipeModal } from "@/components/recipes/add-recipe-modal";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import type { RecipeListItem, RecipeListResponse } from "@/types/recipe";

const LIMIT = 20;

type ActiveComplexity = "EASY" | "MEDIUM" | "HARD" | null;

export function RecipeGrid() {
  const searchParams = useSearchParams();

  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const debouncedQuery = useDebounce(query, 350);
  const [aiSearch, setAiSearch] = useState(() => searchParams.get("ai") === "true");
  const [showFavorites, setShowFavorites] = useState(
    () => searchParams.get("favorites") === "true"
  );
  const [complexity, setComplexity] = useState<ActiveComplexity>(null);

  const [addOpen, setAddOpen]       = useState(false);
  const [previewId, setPreviewId]   = useState<string | null>(null);

  const hasMore = recipes.length < total;

  const fetchRecipes = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: String(LIMIT) });
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (aiSearch && debouncedQuery) params.set("ai", "true");
        if (showFavorites) params.set("favorites", "true");
        if (complexity) params.set("complexity", complexity);

        const res = await fetch(`/api/recipes?${params}`);
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to load recipes"); return; }

        const data = json.data as RecipeListResponse;
        setTotal(data.total);
        setRecipes((prev) => (append ? [...prev, ...data.recipes] : data.recipes));
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery, aiSearch, showFavorites, complexity],
  );

  // Reset and fetch fresh when filters change
  useEffect(() => {
    setPage(1);
    setRecipes([]);
    fetchRecipes(1, false);
  }, [fetchRecipes]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchRecipes(next, true);
  }

  function handleFavoriteToggle(id: string, newValue: boolean) {
    if (showFavorites && !newValue) {
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      setRecipes((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isFavorite: newValue } : r))
      );
    }
  }

  const filtersActive = showFavorites || !!complexity || !!debouncedQuery;

  function clearFilters() {
    setQuery("");
    setShowFavorites(false);
    setComplexity(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Recipe Bank</h1>
          {!loading && (
            <p className="mt-0.5 text-sm text-muted">
              {total} {total === 1 ? "recipe" : "recipes"}
            </p>
          )}
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          Add Recipe
        </Button>
      </div>

      {/* Search */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={aiSearch ? "Describe what you're looking for…" : "Search recipes…"}
            className={cn(
              "w-full rounded-xl border bg-card py-2.5 pl-9 pr-4 text-sm text-text outline-none placeholder:text-muted transition-colors",
              aiSearch
                ? "border-highlight ring-2 ring-highlight/20"
                : "border-border focus:border-highlight focus:ring-2 focus:ring-highlight/20",
            )}
            aria-label="Search recipes"
          />
        </div>
        {/* AI toggle */}
        <button
          type="button"
          onClick={() => setAiSearch((v) => !v)}
          title={aiSearch ? "AI search on — click to use standard search" : "Enable AI semantic search"}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors",
            aiSearch
              ? "border-highlight bg-highlight text-white"
              : "border-border bg-card text-muted hover:border-highlight/50 hover:text-text",
          )}
          aria-pressed={aiSearch}
        >
          {/* Sparkle icon */}
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
          </svg>
          AI
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={showFavorites}
          onClick={() => setShowFavorites((v) => !v)}
        >
          ♥ Favorites
        </FilterChip>
        {(["EASY", "MEDIUM", "HARD"] as const).map((c) => (
          <FilterChip
            key={c}
            active={complexity === c}
            onClick={() => setComplexity((prev) => (prev === c ? null : c))}
          >
            {c === "EASY" ? "Easy" : c === "MEDIUM" ? "Medium" : "Hard"}
          </FilterChip>
        ))}
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-muted transition-colors hover:text-text"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <RecipeGridSkeleton />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : recipes.length === 0 ? (
        <EmptyState hasFilters={filtersActive} onAdd={() => setAddOpen(true)} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onFavoriteToggle={handleFavoriteToggle}
                onPreview={setPreviewId}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : `Load more (${total - recipes.length} remaining)`}
              </Button>
            </div>
          )}
        </>
      )}

      <AddRecipeModal open={addOpen} onClose={() => setAddOpen(false)} />

      {previewId && (
        <RecipePreviewDrawer
          recipeId={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "border-highlight bg-highlight text-brand-white"
          : "border-border bg-card text-text/60 hover:border-highlight/50 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  hasFilters,
  onAdd,
}: {
  hasFilters: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <svg
        className="mb-4 h-12 w-12 text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <circle cx="12" cy="13" r="5" />
        <path d="M12 8v1M5 3v4c0 1.1.9 2 2 2s2-.9 2-2V3M7 9v12M17 3c0 0 2 1.5 2 4s-2 4-2 4v9" />
      </svg>
      {hasFilters ? (
        <>
          <p className="text-sm font-medium text-text">No recipes match your filters</p>
          <p className="mt-1 text-sm text-muted">Try adjusting your search or filters.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-text">No recipes yet</p>
          <p className="mt-1 text-sm text-muted">Add your first recipe to get started.</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 text-sm font-medium text-highlight hover:opacity-80 transition-opacity"
          >
            Add Recipe →
          </button>
        </>
      )}
    </div>
  );
}

function RecipeGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="w-full bg-card-hover" style={{ paddingBottom: "56.25%" }} />
          <div className="space-y-2 p-3">
            <div className="h-4 w-3/4 rounded bg-card-hover" />
            <div className="h-3 w-1/2 rounded bg-card-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}
