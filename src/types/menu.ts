export type MenuSummary = {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;   // YYYY-MM-DD
  endDate: string | null;     // YYYY-MM-DD
  totalServings: number;
  totalCost: string | null;   // formatted "$X.XX" or null
  isPartialCost: boolean;
  itemCount: number;
  recipePhotoUrls: (string | null)[];  // one per item, in sortOrder
  updatedAt: string;
};

export type MenuRecipeItem = {
  id: string;          // MenuItem id
  sortOrder: number;
  servings: number;
  cookDate: string | null;   // YYYY-MM-DD
  notes: string | null;
  recipe: {
    id: string;
    title: string;
    photoUrl: string | null;
    currentServings: number;
    cuisine: string | null;
    dishType: string | null;
    estimatedCost: string | null;  // scaled to menuItem.servings
  };
};

export type MenuDetail = MenuSummary & { items: MenuRecipeItem[] };

export type MenuBand = {
  menuId: string;
  title: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
};
