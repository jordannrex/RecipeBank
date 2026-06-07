"use client";

import { useEffect, useState } from "react";
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
// Menus page
// ---------------------------------------------------------------------------

export default function MenusPage() {
  const [menus, setMenus] = useState<MenuSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [viewingMenuId, setViewingMenuId] = useState<string | null>(null);
  const [viewingMenuMode, setViewingMenuMode] = useState<"view" | "edit">("view");

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
        <div className="space-y-3">
          {menus.map((menu) => (
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
