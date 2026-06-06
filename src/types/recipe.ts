import type { Complexity, Ingredient, IngredientGroup, Recipe, RecipeStep } from "@prisma/client";

export type RecipeWithRelations = Recipe & {
  ingredientGroups: (IngredientGroup & { ingredients: Ingredient[] })[];
  steps: RecipeStep[];
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

export { Complexity };
