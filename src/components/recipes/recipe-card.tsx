"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RecipeListItem } from "@/types/recipe";

const complexityDot: Record<string, string> = {
  EASY: "#22c55e",
  MEDIUM: "#f59e0b",
  HARD: "#ef4444",
};
const complexityLabel: Record<string, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

function formatTime(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

type RecipeCardProps = {
  recipe: RecipeListItem;
  onFavoriteToggle?: (id: string, newValue: boolean) => void;
};

export function RecipeCard({ recipe, onFavoriteToggle }: RecipeCardProps) {
  const [isFavorite, setIsFavorite] = useState(recipe.isFavorite);
  const [toggling, setToggling] = useState(false);

  async function handleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    const prev = isFavorite;
    setIsFavorite(!isFavorite);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/favorite`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) { setIsFavorite(prev); return; }
      const next: boolean = json.data?.isFavorite ?? !prev;
      setIsFavorite(next);
      onFavoriteToggle?.(recipe.id, next);
    } catch {
      setIsFavorite(prev);
    } finally {
      setToggling(false);
    }
  }

  const time = formatTime(recipe.totalTimeMinutes);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-highlight/60 rounded-xl"
    >
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-highlight/40 hover:shadow-sm">
        {/* Photo */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="13" r="5" />
                  <path d="M12 8v1" />
                  <path d="M5 3v4c0 1.1.9 2 2 2s2-.9 2-2V3" />
                  <path d="M7 9v12" />
                  <path d="M17 3c0 0 2 1.5 2 4s-2 4-2 4v9" />
                </svg>
              </div>
            )}
          </div>

          {/* Favorite button */}
          <button
            type="button"
            onClick={handleFavorite}
            disabled={toggling}
            className={cn(
              "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full",
              "bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60 disabled:cursor-not-allowed",
            )}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill={isFavorite ? "#ff3131" : "none"}
              stroke={isFavorite ? "#ff3131" : "white"}
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="truncate text-sm font-semibold text-text leading-snug">{recipe.title}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {recipe.cuisine && (
              <Badge className="text-[10px] px-1.5 py-0">{recipe.cuisine}</Badge>
            )}
            {recipe.dishType && (
              <Badge className="text-[10px] px-1.5 py-0">{recipe.dishType}</Badge>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] text-muted">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: complexityDot[recipe.complexity] ?? "#71717a" }}
              />
              {complexityLabel[recipe.complexity] ?? recipe.complexity}
            </span>
          </div>

          {time && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {time}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
