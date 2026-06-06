export type ShoppingListTab = "general" | "by-recipe";

export type DeduplicatedShoppingItem = {
  normalizedName: string;
  quantity: number | null;
  unit: string | null;
  recipeIds: string[];
  recipeNames: string[];
  itemIds: string[];
  isChecked: boolean;
};
