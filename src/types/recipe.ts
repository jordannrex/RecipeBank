import type { Complexity, Ingredient, IngredientGroup, Recipe, RecipeStep } from "@prisma/client";

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

export { Complexity };
