"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [aiSearch, setAiSearch] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const params = new URLSearchParams({ q: query.trim() });
    if (aiSearch) params.set("ai", "true");
    router.push(`/recipes?${params}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 w-full max-w-2xl">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={aiSearch ? "Describe what you're craving…" : "Search for any recipe here..."}
            autoComplete="off"
            className={cn(
              "w-full rounded-2xl px-6 py-4 pr-12 text-lg font-medium text-white outline-none placeholder:text-white/70 transition-colors",
              aiSearch
                ? "bg-highlight ring-2 ring-white/30"
                : "bg-highlight/80 focus:bg-highlight/90",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 transition-colors hover:text-white"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          )}
        </div>

        {/* AI toggle */}
        <button
          type="button"
          onClick={() => setAiSearch((v) => !v)}
          title={aiSearch ? "AI search on — click to use standard search" : "Enable AI semantic search"}
          aria-pressed={aiSearch}
          className={cn(
            "flex items-center gap-1.5 rounded-2xl border-2 px-4 py-4 text-sm font-semibold transition-colors",
            aiSearch
              ? "border-white bg-white text-highlight"
              : "border-white/40 bg-white/10 text-white hover:border-white/70 hover:bg-white/20",
          )}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
          </svg>
          AI
        </button>
      </div>
    </form>
  );
}
