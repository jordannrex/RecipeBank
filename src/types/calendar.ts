// ---------------------------------------------------------------------------
// Calendar feature types
// ---------------------------------------------------------------------------

export type { MenuBand } from "./menu";

/** A single event on the calendar — either a past cook, a future plan, or a menu recipe. */
export type CalendarEvent = {
  id: string;
  /** "cook-log" = past/today (has notes); "meal-plan" = future; "menu-recipe" = from a menu. */
  type: "cook-log" | "meal-plan" | "menu-recipe";
  recipeId: string;
  recipeTitle: string;
  recipePhotoUrl: string | null;
  /** YYYY-MM-DD local date string. */
  date: string;
  /** Only present on cook-log / menu-recipe entries. */
  notes: string | null;
  // Present only when type === "menu-recipe":
  menuId?: string;
  menuTitle?: string;
};

/** Minimal recipe row used inside the recipe picker panel. */
export type PickerRecipe = {
  id: string;
  title: string;
  photoUrl: string | null;
  cuisine: string | null;
  dishType: string | null;
};
