"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

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

  function reset() {
    setTitle(""); setDescription(""); setCuisine(""); setDishType("");
    setComplexity("MEDIUM"); setPrepTime(""); setCookTime(""); setServings("4");
    setGroups([emptyGroup()]); setSteps([emptyStep()]);
    setPhotoUrl(null); setPhotoLoading(false);
    setError(null);
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
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core fields */}
        <div className="space-y-4">
          <Input id="recipe-title" label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Roast Chicken" />
          <div>
            <label htmlFor="recipe-desc" className="mb-1 block text-sm font-medium text-text">Description</label>
            <textarea
              id="recipe-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description…"
              rows={2}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
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
            <Input id="recipe-cuisine" label="Cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="e.g. Italian" />
            <Input id="recipe-dish-type" label="Dish Type" value={dishType} onChange={(e) => setDishType(e.target.value)} placeholder="e.g. Dinner" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input id="recipe-prep" label="Prep (min)" type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="15" />
            <Input id="recipe-cook" label="Cook (min)" type="number" min="0" value={cookTime} onChange={(e) => setCookTime(e.target.value)} placeholder="45" />
            <Input id="recipe-servings" label="Servings" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
          </div>
          <div>
            <label htmlFor="recipe-complexity" className="mb-1 block text-sm font-medium text-text">Complexity</label>
            <select
              id="recipe-complexity"
              value={complexity}
              onChange={(e) => setComplexity(e.target.value as typeof complexity)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20"
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
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
                    onChange={(e) => setStep(si, "body", e.target.value)}
                    placeholder={`Step ${si + 1}…`}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20 resize-none"
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
    </Dialog>
  );
}
