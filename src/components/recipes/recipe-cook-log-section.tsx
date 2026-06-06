"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LogEntry = {
  id: string;
  cookedAt: string;
  notes: string | null;
  createdAt: string;
};

type Props = { recipeId: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  // cookedAt is a DB Date (no time), serialized as ISO with midnight UTC
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function RecipeCookLogSection({ recipeId }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cookedAt, setCookedAt] = useState(today);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/recipes/${recipeId}/cook-log`)
      .then((r) => r.json())
      .then((j) => { if (j.data) setEntries(j.data as LogEntry[]); })
      .finally(() => setLoading(false));
  }, [recipeId]);

  async function logCook(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/cook-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookedAt,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to log cook"); return; }
      setEntries((prev) =>
        [json.data as LogEntry, ...prev].sort(
          (a, b) => new Date(b.cookedAt).getTime() - new Date(a.cookedAt).getTime(),
        ),
      );
      setShowForm(false);
      setCookedAt(today());
      setNotes("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEntry(id: string) {
    try {
      await fetch(`/api/recipes/${recipeId}/cook-log/${id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {}
  }

  return (
    <section aria-labelledby="cook-log-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="cook-log-heading" className="text-base font-semibold text-text">
          Cook Log
          {entries.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted">
              ({entries.length} {entries.length === 1 ? "time" : "times"})
            </span>
          )}
        </h2>
        {!showForm && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowForm(true)}
            className="text-xs py-1 px-3"
          >
            Log a cook
          </Button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={logCook}
          className="rounded-xl border border-border bg-card p-4 space-y-3"
        >
          <Input
            id="cooked-at"
            type="date"
            label="Date cooked"
            value={cookedAt}
            onChange={(e) => setCookedAt(e.target.value)}
            max={today()}
          />
          <div>
            <label
              htmlFor="cook-notes"
              className="mb-1 block text-sm font-medium text-text"
            >
              Notes <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="cook-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it go? Any tweaks?"
              rows={2}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setShowForm(false); setError(null); }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading cook log…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No cook sessions logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text">{formatDate(entry.cookedAt)}</p>
                {entry.notes && (
                  <p className="mt-0.5 text-xs text-muted">{entry.notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteEntry(entry.id)}
                className="ml-4 flex-shrink-0 text-xs text-muted transition-colors hover:text-destructive"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
