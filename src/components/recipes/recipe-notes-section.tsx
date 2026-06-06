"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type NoteEntry = {
  id: string;
  body: string;
  createdAt: string;
};

type Props = { recipeId: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RecipeNotesSection({ recipeId }: Props) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/recipes/${recipeId}/notes`)
      .then((r) => r.json())
      .then((j) => { if (j.data) setNotes(j.data as NoteEntry[]); })
      .finally(() => setLoading(false));
  }, [recipeId]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to add note"); return; }
      setNotes((prev) => [json.data as NoteEntry, ...prev]);
      setBody("");
      textareaRef.current?.focus();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteNote(id: string) {
    try {
      await fetch(`/api/recipes/${recipeId}/notes/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  }

  return (
    <section aria-labelledby="notes-heading" className="space-y-4">
      <h2 id="notes-heading" className="text-base font-semibold text-text">
        Notes
      </h2>

      <form onSubmit={addNote} className="space-y-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
          aria-label="New note text"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          variant="secondary"
          disabled={submitting || !body.trim()}
        >
          {submitting ? "Saving…" : "Add Note"}
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-border bg-card p-4">
              <p className="whitespace-pre-wrap text-sm text-text">{note.body}</p>
              <div className="mt-2 flex items-center justify-between">
                <time className="text-xs text-muted">{formatDate(note.createdAt)}</time>
                <button
                  type="button"
                  onClick={() => deleteNote(note.id)}
                  className="text-xs text-muted transition-colors hover:text-destructive"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
