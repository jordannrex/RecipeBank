type RecipePageProps = {
  params: Promise<{ id: string }>;
};

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <div className="aspect-video rounded-2xl bg-stone-300 flex items-center justify-center text-muted">
        Recipe hero image — {id}
      </div>

      <div className="flex flex-wrap gap-2">
        {["View", "Edit", "List", "Shopping"].map((mode) => (
          <span
            key={mode}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm"
          >
            {mode}
          </span>
        ))}
      </div>

      <p className="text-sm text-muted">
        Full recipe page with ingredients, steps, notes, cook log — to be implemented
      </p>
    </div>
  );
}
