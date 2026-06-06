import type { CookLog, Complexity, Ingredient, IngredientGroup, Recipe, RecipeEdit, RecipeNote, RecipeStep } from "@prisma/client";

export type RecipeWithRelations = Recipe & {
  ingredientGroups: (IngredientGroup & { ingredients: Ingredient[] })[];
  steps: RecipeStep[];
};

export type RecipeListItem = Pick<
  Recipe,
  "id" | "title" | "photoUrl" | "cuisine" | "dishType" | "isFavorite" | "complexity" |
  "prepTimeMinutes" | "cookTimeMinutes" | "servings" | "createdAt"
> & {
  totalTimeMinutes: number | null;
};

export type RecipeCardData = Pick<
  Recipe,
  "id" | "title" | "photoUrl" | "cuisine" | "dishType" | "isFavorite"
> & {
  totalTimeMinutes: number | null;
};

export type RecipeMode = "view" | "edit" | "list" | "shopping";

export type RecipeFilterChip = {
  id: string;
  label: string;
  field: "favorite" | "cuisine" | "dishType" | "complexity";
  value: string | boolean | Complexity;
};

export type RecipeListResponse = {
  recipes: RecipeListItem[];
  total: number;
  page: number;
  limit: number;
};

// ---------------------------------------------------------------------------
// Phase 2 feature types
// ---------------------------------------------------------------------------

/** A single cook-log entry as returned by the API. */
export type CookLogEntry = Pick<CookLog, "id" | "recipeId" | "userId" | "cookedAt" | "notes" | "createdAt">;

/** A single recipe note as returned by the API. */
export type RecipeNoteEntry = Pick<RecipeNote, "id" | "recipeId" | "userId" | "body" | "createdAt" | "updatedAt">;

/** A single edit-history record as returned by the API. */
export type RecipeEditEntry = Pick<RecipeEdit, "id" | "recipeId" | "userId" | "fieldName" | "oldValue" | "newValue" | "createdAt">;

/** Response shape from GET /api/recipes/[id]/edits */
export type RecipeEditsResponse = {
  edits: RecipeEditEntry[];
  nextCursor: string | null;
  hasMore: boolean;
};

export { Complexity };
