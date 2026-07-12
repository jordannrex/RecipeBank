// ---------------------------------------------------------------------------
// Curated cuisine / dish-type collections used by the home-page rows and the
// recipes list "See all" filter. Single source of truth so both surfaces group
// recipes identically.
//
// `cuisine`/`dishType` are free-text (e.g. "Italian", "Italian-American",
// "Tex-Mex"), so each collection matches a set of case-insensitive substrings
// rather than one exact value.
// ---------------------------------------------------------------------------

export type RecipeCollection = {
  /** URL-safe id used in `/recipes?collection=<slug>`. */
  slug: string;
  title: string;
  field: "cuisine" | "dishType";
  /** A recipe qualifies if its field contains any of these (case-insensitive). */
  terms: string[];
};

export const RECIPE_COLLECTIONS: RecipeCollection[] = [
  { slug: "italian",       title: "Italian",                  field: "cuisine",  terms: ["Italian"] },
  { slug: "latin-mexican", title: "Latin American & Mexican", field: "cuisine",  terms: ["Mexican", "Tex-Mex", "Latin"] },
  { slug: "american",      title: "American",                 field: "cuisine",  terms: ["American", "Cajun", "Soul Food", "Southern"] },
  { slug: "caribbean",     title: "Caribbean",                field: "cuisine",  terms: ["Caribbean", "Jamaican", "Haitian", "Cuban", "Puerto Rican"] },
  { slug: "asian",         title: "Asian",                    field: "cuisine",  terms: ["Asian", "Japanese", "Chinese", "Thai", "Korean", "Vietnamese", "Indian"] },
  { slug: "pasta",         title: "Pasta",                    field: "dishType", terms: ["Pasta"] },
  { slug: "rice-bowls",    title: "Rice Bowls",               field: "dishType", terms: ["Rice"] },
];

export function getRecipeCollection(slug: string): RecipeCollection | undefined {
  return RECIPE_COLLECTIONS.find((c) => c.slug === slug);
}

/**
 * Prisma OR-array of case-insensitive `contains` conditions for a collection —
 * drop into a `where` as `{ AND: [{ OR: collectionWhereOR(c) }] }` so it
 * composes with any other active filters.
 */
export function collectionWhereOR(c: RecipeCollection) {
  return c.terms.map((t) =>
    c.field === "cuisine"
      ? { cuisine: { contains: t, mode: "insensitive" as const } }
      : { dishType: { contains: t, mode: "insensitive" as const } },
  );
}
