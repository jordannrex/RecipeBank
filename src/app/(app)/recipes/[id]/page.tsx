import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RecipeDetailView } from "@/components/recipes/recipe-detail-view";
import type { SerializedRecipeWithRelations } from "@/types/recipe";

type RecipePageProps = {
  params: Promise<{ id: string }>;
};

export default async function RecipePage({ params }: RecipePageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const recipe = await prisma.recipe.findFirst({
    where: { id, userId: user.id },
    include: {
      ingredientGroups: {
        include: { ingredients: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      steps: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!recipe) notFound();

  // Serialize: convert Date objects and Prisma.Decimal to plain primitives
  const serialized: SerializedRecipeWithRelations = JSON.parse(JSON.stringify(recipe));

  return <RecipeDetailView recipe={serialized} />;
}
