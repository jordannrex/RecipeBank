import type { CookLog, Complexity, Ingredient, IngredientGroup, Recipe, RecipeNote, RecipeStep } from "@prisma/client";

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

export { Complexity };

// ---------------------------------------------------------------------------
// Serialized types for server → client component boundaries
// (Dates become ISO strings, Decimal becomes string)
// ---------------------------------------------------------------------------

export type SerializedIngredient = {
  id: string;
  ingredientGroupId: string;
  quantity: string | null;
  unit: string | null;
  name: string;
  preparation: string | null;
  isOptional: boolean;
  sortOrder: number;
  // Persisted price calculator data (Decimal serialized as string, same as quantity)
  storePkgQty: string | null;
  storePkgUnit: string | null;
  price: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedIngredientGroup = {
  id: string;
  recipeId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  ingredients: SerializedIngredient[];
};

export type SerializedRecipeStep = {
  id: string;
  recipeId: string;
  sectionHeader: string | null;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SerializedRecipeWithRelations = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  photoUrl: string | null;
  sourceUrl: string | null;
  servings: number;
  currentServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  complexity: Complexity;
  dishType: string | null;
  cuisine: string | null;
  flavorProfile: string | null;
  isFavorite: boolean;
  cookCount: number;
  lastCookedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ingredientGroups: SerializedIngredientGroup[];
  steps: SerializedRecipeStep[];
};
