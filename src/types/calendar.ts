// ---------------------------------------------------------------------------
// Calendar feature types
// ---------------------------------------------------------------------------

/** A single event on the calendar — either a past cook or a future plan. */
export type CalendarEvent = {
  id: string;
  /** "cook-log" = past/today (has notes); "meal-plan" = future (no notes). */
  type: "cook-log" | "meal-plan";
  recipeId: string;
  recipeTitle: string;
  recipePhotoUrl: string | null;
  /** YYYY-MM-DD local date string. */
  date: string;
  /** Only present on cook-log entries. */
  notes: string | null;
};

/** Minimal recipe row used inside the recipe picker panel. */
export type PickerRecipe = {
  id: string;
  title: string;
  photoUrl: string | null;
  cuisine: string | null;
  dishType: string | null;
};
