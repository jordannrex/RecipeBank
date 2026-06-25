// ---------------------------------------------------------------------------
// Calendar feature types
// ---------------------------------------------------------------------------

export type { MealPlanBand } from "./meal-plan";

/** A single event on the calendar — either a past cook, a future plan, or a mealPlan recipe. */
export type CalendarEvent = {
  id: string;
  /** "cook-log" = past/today (has notes); "scheduled-meal" = future; "meal-plan-recipe" = from a mealPlan. */
  type: "cook-log" | "scheduled-meal" | "meal-plan-recipe";
  recipeId: string;
  recipeTitle: string;
  recipePhotoUrl: string | null;
  /** YYYY-MM-DD local date string. */
  date: string;
  /** Only present on cook-log / meal-plan-recipe entries. */
  notes: string | null;
  // Present only when type === "meal-plan-recipe":
  mealPlanId?: string;
  mealPlanTitle?: string;
};

/** Minimal recipe row used inside the recipe picker panel. */
export type PickerRecipe = {
  id: string;
  title: string;
  photoUrl: string | null;
  cuisine: string | null;
  dishType: string | null;
};
