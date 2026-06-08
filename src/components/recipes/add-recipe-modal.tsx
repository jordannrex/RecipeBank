"use client";

import { useState } from "react";

/** Auto-grow a textarea to fit its content. */
function growTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** After React flushes DOM updates, resize every textarea in the form. */
function resizeAllTextareas() {
  setTimeout(() => {
    document.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(growTextarea);
  }, 0);
}
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ImportedRecipe } from "@/lib/recipe-import";
import { parsePastedRecipe, type ParsedRecipe } from "@/lib/paste-parser";

type IngredientRow = {
  name: string;
  quantity: string;
  unit: string;
  preparation: string;
};

type GroupRow = {
  name: string;
  ingredients: IngredientRow[];
};

type StepRow = { body: string; sectionHeader: string };

function emptyIngredient(): IngredientRow {
  return { name: "", quantity: "", unit: "", preparation: "" };
}
function emptyGroup(): GroupRow {
  return { name: "", ingredients: [emptyIngredient()] };
}
function emptyStep(): StepRow {
  return { body: "", sectionHeader: "" };
}

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Resize an image file to at most maxDim × maxDim, returns a JPEG data URL. */
async function resizeImage(file: File, maxDim = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
    img.src = objectUrl;
  });
}

export function AddRecipeModal({ open, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [cuisine, setCuisine] = useState("");
  const [dishType, setDishType] = useState("");
  const [complexity, setComplexity] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("4");
  const [groups, setGroups] = useState<GroupRow[]>([emptyGroup()]);
  const [steps, setSteps] = useState<StepRow[]>([emptyStep()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── URL import state ────────────────────────────────────────────
  const [mode, setMode] = useState<"import" | "paste" | "manual">("manual");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  // ── Paste state ─────────────────────────────────────────────────
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState<ParsedRecipe | null>(null);

  // ── AI metadata suggestion state ────────────────────────────────
  // Fields currently holding an unconfirmed AI suggestion (shown in brand-red).
  const [suggestedFields, setSuggestedFields] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  /** Remove a field from the suggested set (called when the user edits it). */
  function clearSuggested(field: string) {
    setSuggestedFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function handleSuggestMetadata() {
    if (!title.trim()) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/recipes/suggest-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          ingredients: groups.flatMap((g) => g.ingredients.map((i) => i.name).filter(Boolean)),
          steps: steps.map((s) => s.body).filter(Boolean).slice(0, 6),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSuggestError(json.error ?? "Couldn't generate suggestions."); return; }
      const data = json.data as {
        cuisine: string | null;
        dishType: string | null;
        complexity: "EASY" | "MEDIUM" | "HARD" | null;
        prepTimeMinutes: number | null;
        cookTimeMinutes: number | null;
        description: string | null;
      };
      const newSuggested = new Set<string>();
      if (data.cuisine    && !cuisine.trim())  { setCuisine(data.cuisine);                       newSuggested.add("cuisine"); }
      if (data.dishType   && !dishType.trim()) { setDishType(data.dishType);                     newSuggested.add("dishType"); }
      if (data.complexity && complexity === "MEDIUM") { setComplexity(data.complexity);           newSuggested.add("complexity"); }
      if (data.prepTimeMinutes && !prepTime.trim()) { setPrepTime(String(data.prepTimeMinutes)); newSuggested.add("prepTimeMinutes"); }
      if (data.cookTimeMinutes && !cookTime.trim()) { setCookTime(String(data.cookTimeMinutes)); newSuggested.add("cookTimeMinutes"); }
      if (data.description && !description.trim()) { setDescription(data.description); resizeAllTextareas(); newSuggested.add("description"); }
      setSuggestedFields(newSuggested);
    } catch { setSuggestError("Network error — please try again."); } finally {
      setSuggesting(false);
    }
  }

  function reset() {
    setTitle(""); setDescription(""); setCuisine(""); setDishType("");
    setComplexity("MEDIUM"); setPrepTime(""); setCookTime(""); setServings("4");
    setGroups([emptyGroup()]); setSteps([emptyStep()]);
    setPhotoUrl(null); setPhotoLoading(false);
    setError(null);
    setMode("manual"); setImportUrl(""); setImporting(false);
    setImportError(null); setImportedFrom(null); setSourceUrl(null);
    setSuggestedFields(new Set()); setSuggesting(false); setSuggestError(null);
    setPasteText(""); setPasteResult(null);
  }

  /** Populate the manual form from a parsed paste result, then switch to manual tab. */
  function populateFromPaste(parsed: ParsedRecipe) {
    setTitle(parsed.title);
    setDescription("");
    setPhotoUrl(null);
    setSourceUrl(parsed.url);
    if (parsed.url) {
      try { setImportedFrom(new URL(parsed.url).hostname.replace(/^www\./, "")); } catch { /* ignore */ }
    } else {
      setImportedFrom(null);
    }
    setGroups(
      parsed.ingredientGroups.length > 0
        ? parsed.ingredientGroups.map((g) => ({
            name: g.name,
            ingredients:
              g.ingredients.length > 0
                ? g.ingredients.map((i) => ({
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit,
                    preparation: i.preparation,
                  }))
                : [emptyIngredient()],
          }))
        : [emptyGroup()],
    );
    setSteps(
      parsed.steps.length > 0
        ? parsed.steps.map((s) => ({ body: s, sectionHeader: "" }))
        : [emptyStep()],
    );
    setMode("manual");
    resizeAllTextareas();
  }

  function populateFromImport(imported: ImportedRecipe) {
    setTitle(imported.title);
    setDescription(imported.description ?? "");
    setPhotoUrl(imported.photoUrl ?? null);
    setPhotoLoading(false);
    setCuisine(imported.cuisine ?? "");
    setDishType(imported.dishType ?? "");
    setComplexity(imported.complexity ?? "MEDIUM");
    setPrepTime(imported.prepTimeMinutes?.toString() ?? "");
    setCookTime(imported.cookTimeMinutes?.toString() ?? "");
    setServings(imported.servings?.toString() ?? "4");
    setSourceUrl(imported.sourceUrl);
    try { setImportedFrom(new URL(imported.sourceUrl).hostname.replace(/^www\./, "")); } catch { /* ignore */ }
    setGroups(
      imported.ingredientGroups.length > 0
        ? imported.ingredientGroups.map((g) => ({
            name: g.name,
            ingredients:
              g.ingredients.length > 0
                ? g.ingredients.map((i) => ({
                    name: i.name,
                    quantity: i.quantity?.toString() ?? "",
                    unit: i.unit ?? "",
                    preparation: i.preparation ?? "",
                  }))
                : [emptyIngredient()],
          }))
        : [emptyGroup()],
    );
    setSteps(
      imported.steps.length > 0
        ? imported.steps.map((s) => ({ body: s.body, sectionHeader: s.sectionHeader ?? "" }))
        : [emptyStep()],
    );
    setMode("manual");
    resizeAllTextareas();
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setImportError(json.error ?? "Import failed"); return; }
      populateFromImport(json.data as ImportedRecipe);
    } catch {
      setImportError("Something went wrong. Check the URL and try again.");
    } finally {
      setImporting(false);
    }
  }

  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setPhotoLoading(true);
    try {
      const dataUrl = await resizeImage(file);
      setPhotoUrl(dataUrl);
    } catch {
      // silently ignore resize errors
    } finally {
      setPhotoLoading(false);
    }
  }

  function handleClose() { reset(); onClose(); }

  // --- ingredient helpers ---
  function setIngredient(gi: number, ii: number, field: keyof IngredientRow, val: string) {
    setGroups((prev) =>
      prev.map((g, gIdx) =>
        gIdx !== gi ? g : {
          ...g,
          ingredients: g.ingredients.map((ing, iIdx) =>
            iIdx !== ii ? ing : { ...ing, [field]: val }
          ),
        }
      )
    );
  }
  function addIngredient(gi: number) {
    setGroups((prev) =>
      prev.map((g, gIdx) =>
        gIdx !== gi ? g : { ...g, ingredients: [...g.ingredients, emptyIngredient()] }
      )
    );
  }
  function removeIngredient(gi: number, ii: number) {
    setGroups((prev) =>
      prev.map((g, gIdx) =>
        gIdx !== gi ? g : { ...g, ingredients: g.ingredients.filter((_, iIdx) => iIdx !== ii) }
      )
    );
  }
  function setGroupName(gi: number, val: string) {
    setGroups((prev) => prev.map((g, gIdx) => (gIdx !== gi ? g : { ...g, name: val })));
  }
  function addGroup() { setGroups((prev) => [...prev, emptyGroup()]); }
  function removeGroup(gi: number) {
    setGroups((prev) => prev.filter((_, gIdx) => gIdx !== gi));
  }

  // --- step helpers ---
  function setStep(si: number, field: keyof StepRow, val: string) {
    setSteps((prev) => prev.map((s, sIdx) => (sIdx !== si ? s : { ...s, [field]: val })));
  }
  function addStep() { setSteps((prev) => [...prev, emptyStep()]); }
  function removeStep(si: number) {
    setSteps((prev) => prev.filter((_, sIdx) => sIdx !== si));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        photoUrl: photoUrl ?? null,
        sourceUrl: sourceUrl ?? null,
        cuisine: cuisine.trim() || null,
        dishType: dishType.trim() || null,
        complexity,
        prepTimeMinutes: prepTime ? parseInt(prepTime, 10) : null,
        cookTimeMinutes: cookTime ? parseInt(cookTime, 10) : null,
        servings: parseInt(servings, 10) || 4,
        ingredientGroups: groups
          .filter((g) => g.ingredients.some((i) => i.name.trim()))
          .map((g, gi) => ({
            name: g.name,
            sortOrder: gi,
            ingredients: g.ingredients
              .filter((i) => i.name.trim())
              .map((i, ii) => ({
                name: i.name.trim(),
                quantity: i.quantity ? parseFloat(i.quantity) : null,
                unit: i.unit.trim() || null,
                preparation: i.preparation.trim() || null,
                isOptional: false,
                sortOrder: ii,
              })),
          })),
        steps: steps
          .filter((s) => s.body.trim())
          .map((s, si) => ({
            body: s.body.trim(),
            sectionHeader: s.sectionHeader.trim() || null,
            sortOrder: si,
          })),
      };

      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to create recipe"); return; }
      reset();
      onClose();
      router.push(`/recipes/${json.data.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Add Recipe" className="max-w-2xl">
      {/* ── Mode switcher ─────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-center">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {(["import", "paste", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-text text-background shadow-sm" : "text-text/60 hover:text-text",
              )}
            >
              {m === "import" ? "Import URL" : m === "paste" ? "Paste" : "Manual Entry"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Import URL panel ──────────────────────────────────────── */}
      {mode === "import" && (
        <form onSubmit={handleImport} className="space-y-4 pb-2">
          <p className="text-sm text-muted">
            Paste a recipe URL and we&apos;ll extract the ingredients, steps, and metadata automatically.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://www.example.com/recipe/..."
              className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20"
              autoFocus
            />
            <Button type="submit" disabled={importing || !importUrl.trim()}>
              {importing ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Importing…
                </span>
              ) : "Import"}
            </Button>
          </div>
          {importError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {importError}
            </div>
          )}
          <p className="text-xs text-muted">
            Works with most recipe sites. TikTok, Instagram, and YouTube recipes are extracted from the caption only.
          </p>
        </form>
      )}

      {/* ── Paste panel ──────────────────────────────────────────── */}
      {mode === "paste" && (
        <div className="space-y-4 pb-2">
          <p className="text-sm text-muted">
            Paste your recipe text below. Include clear section headers like{" "}
            <span className="font-medium text-text">Ingredients:</span> and{" "}
            <span className="font-medium text-text">Instructions:</span> for the best results.
          </p>

          {/* Example format hint */}
          {!pasteResult && (
            <div className="rounded-xl border border-border bg-card/60 px-4 py-3 font-mono text-xs leading-relaxed text-muted">
              <span className="block text-text/70 not-italic font-sans text-xs mb-1 font-medium">Expected format:</span>
              Recipe Title<br />
              https://source-url.com (optional)<br />
              <br />
              Ingredients:<br />
              - 2 cups flour<br />
              - 1 tbsp olive oil<br />
              <br />
              For the sauce:<br />
              - 1 can tomato sauce<br />
              <br />
              Instructions:<br />
              1. Preheat oven to 375°F<br />
              2. Mix dry ingredients
            </div>
          )}

          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setPasteResult(null); growTextarea(e.target); }}
            ref={growTextarea}
            placeholder="Paste your recipe here…"
            rows={10}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none overflow-hidden font-mono leading-relaxed"
          />

          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={!pasteText.trim()}
              onClick={() => setPasteResult(parsePastedRecipe(pasteText))}
            >
              Parse Recipe
            </Button>
            {pasteResult && (
              <button
                type="button"
                onClick={() => { setPasteText(""); setPasteResult(null); }}
                className="text-xs text-muted hover:text-text transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* ── Parse result preview ───────────────────────────────── */}
          {pasteResult && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-border bg-card/80">
                <p className="text-sm font-semibold text-text">Parse Result</p>
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Title */}
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 text-base">📋</span>
                  <div>
                    <p className="text-xs text-muted font-medium uppercase tracking-wide">Title</p>
                    {pasteResult.title ? (
                      <p className="text-sm text-text font-medium">{pasteResult.title}</p>
                    ) : (
                      <p className="text-sm text-muted italic">Not detected — add manually</p>
                    )}
                  </div>
                </div>

                {/* Source URL */}
                {pasteResult.url && (
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex-shrink-0 text-base">🔗</span>
                    <div>
                      <p className="text-xs text-muted font-medium uppercase tracking-wide">Source</p>
                      <p className="text-sm text-highlight truncate">
                        {(() => { try { return new URL(pasteResult.url!).hostname.replace(/^www\./, ""); } catch { return pasteResult.url; } })()}
                      </p>
                    </div>
                  </div>
                )}

                {/* Ingredients summary */}
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 text-base">🥕</span>
                  <div>
                    <p className="text-xs text-muted font-medium uppercase tracking-wide">Ingredients</p>
                    {pasteResult.ingredientGroups.length > 0 ? (
                      <div className="space-y-1">
                        {pasteResult.ingredientGroups.map((g, gi) => {
                          const label = g.name || (pasteResult.ingredientGroups.length > 1 ? `Group ${gi + 1}` : null);
                          return (
                            <p key={gi} className="text-sm text-text">
                              {g.ingredients.length} ingredient{g.ingredients.length !== 1 ? "s" : ""}
                              {label ? <span className="text-muted"> — {label}</span> : null}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted italic">None detected</p>
                    )}
                  </div>
                </div>

                {/* Steps summary */}
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 text-base">📝</span>
                  <div>
                    <p className="text-xs text-muted font-medium uppercase tracking-wide">Steps</p>
                    {pasteResult.steps.length > 0 ? (
                      <p className="text-sm text-text">{pasteResult.steps.length} step{pasteResult.steps.length !== 1 ? "s" : ""} found</p>
                    ) : (
                      <p className="text-sm text-muted italic">None detected</p>
                    )}
                  </div>
                </div>

                {/* Warnings */}
                {pasteResult.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1">
                    {pasteResult.warnings.map((w, wi) => (
                      <p key={wi} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <svg className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                        </svg>
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer action */}
              <div className="px-4 py-3 border-t border-border bg-card/60 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Review and edit in the manual form after filling.
                </p>
                <Button
                  type="button"
                  onClick={() => populateFromPaste(pasteResult)}
                  disabled={pasteResult.ingredientGroups.length === 0 && pasteResult.steps.length === 0 && !pasteResult.title}
                >
                  Fill Form →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual entry form ─────────────────────────────────────── */}
      {mode === "manual" && (
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core fields */}
        <div className="space-y-4">
          <Input id="recipe-title" label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Roast Chicken" />
          <div>
            <label htmlFor="recipe-desc" className="mb-1 block text-sm font-medium text-text">Description</label>
            <textarea
              id="recipe-desc"
              value={description}
              onChange={(e) => { setDescription(e.target.value); clearSuggested("description"); growTextarea(e.target); }}
              ref={growTextarea}
              placeholder="A brief description…"
              rows={2}
              className={cn(
                "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none overflow-hidden",
                suggestedFields.has("description") ? "text-brand-red" : "text-text",
              )}
            />
          </div>
          {/* Photo upload */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text">Photo (optional)</label>
            {photoUrl ? (
              <div className="relative overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Recipe preview"
                  className="w-full object-cover"
                  style={{ maxHeight: "200px" }}
                />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                  aria-label="Remove photo"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                    <path d="M2 2l10 10M12 2L2 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-4 py-5 text-center transition-colors hover:border-highlight/50 hover:bg-card-hover">
                {photoLoading ? (
                  <span className="text-sm text-muted">Processing…</span>
                ) : (
                  <>
                    <svg className="h-7 w-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-sm text-muted">Click to upload a photo</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) await handlePhotoFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="recipe-cuisine" label="Cuisine" value={cuisine} placeholder="e.g. Italian"
              className={suggestedFields.has("cuisine") ? "text-brand-red" : undefined}
              onChange={(e) => { setCuisine(e.target.value); clearSuggested("cuisine"); }}
            />
            <Input
              id="recipe-dish-type" label="Dish Type" value={dishType} placeholder="e.g. Dinner"
              className={suggestedFields.has("dishType") ? "text-brand-red" : undefined}
              onChange={(e) => { setDishType(e.target.value); clearSuggested("dishType"); }}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input
              id="recipe-prep" label="Prep (min)" type="number" min="0" value={prepTime} placeholder="15"
              className={suggestedFields.has("prepTimeMinutes") ? "text-brand-red" : undefined}
              onChange={(e) => { setPrepTime(e.target.value); clearSuggested("prepTimeMinutes"); }}
            />
            <Input
              id="recipe-cook" label="Cook (min)" type="number" min="0" value={cookTime} placeholder="45"
              className={suggestedFields.has("cookTimeMinutes") ? "text-brand-red" : undefined}
              onChange={(e) => { setCookTime(e.target.value); clearSuggested("cookTimeMinutes"); }}
            />
            <Input id="recipe-servings" label="Servings" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
          </div>
          <div>
            <label htmlFor="recipe-complexity" className="mb-1 block text-sm font-medium text-text">Complexity</label>
            <select
              id="recipe-complexity"
              value={complexity}
              onChange={(e) => { setComplexity(e.target.value as typeof complexity); clearSuggested("complexity"); }}
              className={cn(
                "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20",
                suggestedFields.has("complexity") ? "text-brand-red" : "text-text",
              )}
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          {/* Suggest Metadata */}
          <button
            type="button"
            onClick={handleSuggestMetadata}
            disabled={!title.trim() || suggesting}
            className="flex items-center gap-1.5 self-start rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-highlight/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {suggesting ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Suggesting…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
                Suggest Metadata
              </>
            )}
          </button>
          {suggestError && (
            <p className="text-xs text-destructive">{suggestError}</p>
          )}
        </div>

        {/* Ingredients */}
        <div>
          <p className="mb-2 text-sm font-semibold text-text">Ingredients</p>
          <div className="space-y-4">
            {groups.map((group, gi) => (
              <div key={gi} className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
                {groups.length > 1 && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={group.name}
                      onChange={(e) => setGroupName(gi, e.target.value)}
                      placeholder="Group name (e.g. For the sauce)"
                      className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight"
                    />
                    <button type="button" onClick={() => removeGroup(gi)} className="text-xs text-muted hover:text-destructive">
                      Remove group
                    </button>
                  </div>
                )}
                {group.ingredients.map((ing, ii) => (
                  <div key={ii} className="flex gap-2 items-start">
                    <input
                      type="number"
                      value={ing.quantity}
                      onChange={(e) => setIngredient(gi, ii, "quantity", e.target.value)}
                      placeholder="Qty"
                      min="0"
                      step="any"
                      className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={ing.unit}
                      onChange={(e) => setIngredient(gi, ii, "unit", e.target.value)}
                      placeholder="Unit"
                      className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => setIngredient(gi, ii, "name", e.target.value)}
                      placeholder="Ingredient name *"
                      className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight"
                    />
                    <input
                      type="text"
                      value={ing.preparation}
                      onChange={(e) => setIngredient(gi, ii, "preparation", e.target.value)}
                      placeholder="Prep note"
                      className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight flex-shrink-0"
                    />
                    {group.ingredients.length > 1 && (
                      <button type="button" onClick={() => removeIngredient(gi, ii)} className="flex-shrink-0 text-muted hover:text-destructive mt-1.5" aria-label="Remove ingredient">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => addIngredient(gi)} className="text-xs text-highlight hover:opacity-80">
                  + Add ingredient
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addGroup} className="mt-2 text-xs text-muted hover:text-text">
            + Add ingredient group
          </button>
        </div>

        {/* Steps */}
        <div>
          <p className="mb-2 text-sm font-semibold text-text">Steps</p>
          <div className="space-y-2">
            {steps.map((step, si) => (
              <div key={si} className="flex gap-2 items-start">
                <span className="mt-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-highlight text-xs font-bold text-brand-white">
                  {si + 1}
                </span>
                <div className="flex-1 space-y-1">
                  {step.sectionHeader !== undefined && (
                    <input
                      type="text"
                      value={step.sectionHeader}
                      onChange={(e) => setStep(si, "sectionHeader", e.target.value)}
                      placeholder="Section header (optional)"
                      className="w-full rounded-lg border border-border bg-card px-2 py-1 text-xs text-text outline-none placeholder:text-muted focus:border-highlight"
                    />
                  )}
                  <textarea
                    value={step.body}
                    onChange={(e) => { setStep(si, "body", e.target.value); growTextarea(e.target); }}
                    ref={growTextarea}
                    placeholder={`Step ${si + 1}…`}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none overflow-hidden"
                  />
                </div>
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(si)} className="flex-shrink-0 text-muted hover:text-destructive mt-2" aria-label="Remove step">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addStep} className="mt-2 text-xs text-highlight hover:opacity-80">
            + Add step
          </button>
        </div>

        {/* Imported-from banner */}
        {importedFrom && (
          <div className="rounded-xl border border-highlight/30 bg-highlight/5 px-4 py-2.5 text-sm text-text flex items-center gap-2">
            <svg className="h-4 w-4 flex-shrink-0 text-highlight" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            <span>Imported from <strong>{importedFrom}</strong> — review and save below.</span>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Recipe"}
          </Button>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
      )}
    </Dialog>
  );
}
