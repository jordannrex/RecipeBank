import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 p-8">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome back{displayName(user)}! What are we cooking today?
        </h1>
        <p className="mt-2 text-muted">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <div className="mt-6 h-12 rounded-xl border border-border bg-card px-4 text-muted flex items-center">
          AI search bar — to be implemented
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Suggested Meals</h2>
        <p className="text-sm text-muted">Horizontally scrollable recipe gallery — to be implemented</p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Recently Cooked</h2>
        <p className="text-sm text-muted">Recent cook log strip — to be implemented</p>
      </section>
    </div>
  );
}

function displayName(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return user ? `, ${user.displayName}` : "";
}
