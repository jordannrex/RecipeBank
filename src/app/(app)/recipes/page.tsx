export default function RecipeBankPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recipe Bank</h1>
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add Recipe
        </button>
      </div>

      <div className="mx-auto max-w-[700px] h-12 rounded-xl border border-border bg-card px-4 text-muted flex items-center">
        AI-powered search — to be implemented
      </div>

      <div className="flex flex-wrap gap-2">
        {["All", "Favorites", "Cuisine", "Dish Type", "Complexity"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border bg-card px-3 py-1 text-sm text-muted"
          >
            {chip}
          </span>
        ))}
      </div>

      <p className="text-sm text-muted">Recipe grid with infinite scroll — to be implemented</p>
    </div>
  );
}
