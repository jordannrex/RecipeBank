import { Suspense } from "react";
import { RecipeGrid } from "@/components/recipes/recipe-grid";

export default function RecipeBankPage() {
  return (
    <Suspense>
      <RecipeGrid />
    </Suspense>
  );
}
