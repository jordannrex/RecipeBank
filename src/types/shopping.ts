// Types for the Shopping List feature.
// Mirrors the ShoppingList / ShoppingItem Prisma models.

export type ShoppingListTab = "general" | "by-recipe";

/** A single shopping item as returned from the API. */
export type ShoppingItemRow = {
  id: string;
  shoppingListId: string;
  ingredientId: string | null;
  recipeId: string | null;
  /** Display name — either the ingredient name or a manually entered name. */
  name: string;
  quantity: number | null;
  unit: string | null;
  isChecked: boolean;
  isManual: boolean;
  /** Denormalized recipe name for display (null for manually added items). */
  recipeName: string | null;
  // Persisted price calculator data.
  // For recipe-linked items this comes from the Ingredient record (shared).
  // For manually added items it comes from the ShoppingItem record itself.
  storePkgQty: number | null;
  storePkgUnit: string | null;
  price: number | null;
};

/**
 * Used by the General tab to present items grouped only by checked state,
 * with a recipe source label beside each item.
 */
export type FlatShoppingItem = ShoppingItemRow;

/**
 * Used by the By Recipe tab: items collected under a single recipe header.
 * recipeId / recipeName are null for the "Manually added" group.
 */
export type ShoppingGroup = {
  recipeId: string | null;
  recipeName: string;
  items: ShoppingItemRow[];
};
