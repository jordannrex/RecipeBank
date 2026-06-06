"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "General" | "By Recipe";

export default function ShoppingListPage() {
  const [tab, setTab] = useState<Tab>("General");

  // Placeholder counts — will be real data in Phase 3
  const totalItems: number = 0;
  const checkedItems: number = 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Shopping List</h1>
          <p className="mt-0.5 text-sm text-muted">
            {totalItems} {totalItems === 1 ? "item" : "items"} · {checkedItems} checked
          </p>
        </div>

        {/* + Add button */}
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-card-hover"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add
        </button>
      </div>

      {/* Tab row */}
      <div className="flex items-center justify-between">
        {/* Pill tab switcher */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {(["General", "By Recipe"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                tab === t
                  ? "bg-text text-background shadow-sm"
                  : "text-text/60 hover:text-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Delete all */}
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium text-destructive transition-opacity hover:opacity-75"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 7-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
          </svg>
          Delete all
        </button>
      </div>

      {/* Placeholder content */}
      <p className="text-sm text-muted">
        {tab === "General"
          ? "All items will appear here — to be implemented in Phase 3."
          : "Items grouped by recipe will appear here — to be implemented in Phase 3."}
      </p>
    </div>
  );
}
