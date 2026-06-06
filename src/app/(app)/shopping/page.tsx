export default function ShoppingListPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Shopping List</h1>

      <div className="flex border-b border-border">
        {["General", "By Recipe"].map((tab) => (
          <button
            key={tab}
            type="button"
            className="border-b-2 border-primary px-4 py-2 text-sm font-medium"
          >
            {tab}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">
        Deduplicated shopping list with price input — to be implemented
      </p>
    </div>
  );
}
