import Link from "next/link";
import { HomeRecipeCard } from "@/components/home/home-recipe-card";
import { HeroSearch } from "@/components/home/hero-search";
import { HeroRecipeBackdrop, type JournalRecipe } from "@/components/home/hero-recipe-backdrop";
import { Logo } from "@/components/ui/logo";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { realizePastScheduledMeals } from "@/lib/scheduled-meal-realize";

// ─── Types ──────────────────────────────────────────────────────────────────

type MinRecipe = {
  id: string;
  title: string;
  photoUrl: string | null;
  complexity: "EASY" | "MEDIUM" | "HARD" | "NONE";
  cuisine: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatLastCooked(date: Date | null): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Pull a shuffled set of the user's own recipes to fill the hero backdrop —
 * title + ingredient names only (no quantities/units). Re-shuffles on each page
 * load. Returns null when the user has 8 or fewer recipes, so the backdrop
 * falls back to its seeded default cards.
 */
async function getBackdropRecipes(userId: string): Promise<JournalRecipe[] | null> {
  const count = await prisma.recipe.count({ where: { userId } });
  if (count <= 8) return null;

  // Random over-fetch, so we still land 8 cards even if a few have no ingredients.
  const picked = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM recipes WHERE user_id = ${userId} ORDER BY random() LIMIT 12
  `;
  const ids = picked.map((p) => p.id);
  if (ids.length < 8) return null;

  const recipes = await prisma.recipe.findMany({
    where: { id: { in: ids } },
    select: {
      title: true,
      complexity: true,
      servings: true,
      ingredientGroups: {
        orderBy: { sortOrder: "asc" },
        select: { ingredients: { orderBy: { sortOrder: "asc" }, select: { name: true } } },
      },
    },
  });

  const mapped: JournalRecipe[] = recipes
    .map((r) => ({
      title: r.title,
      ingredients: r.ingredientGroups
        .flatMap((g) => g.ingredients.map((i) => i.name))
        .filter(Boolean)
        .slice(0, 6),
      complexity: r.complexity,
      servings: r.servings,
    }))
    .filter((r) => r.ingredients.length > 0);

  if (mapped.length < 8) return null;

  // Fisher–Yates shuffle so card positions vary too, not just which recipes.
  for (let i = mapped.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
  }
  return mapped.slice(0, 8);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Three-tile stats strip */
function StatsBar({
  totalRecipes,
  totalFavorites,
  lastCookedAt,
}: {
  totalRecipes: number;
  totalFavorites: number;
  lastCookedAt: Date | null;
}) {
  const stats = [
    {
      href: "/recipes",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      value: totalRecipes,
      label: totalRecipes === 1 ? "Recipe" : "Recipes",
    },
    {
      href: "/recipes?favorites=true",
      icon: (
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
        </svg>
      ),
      value: totalFavorites,
      label: totalFavorites === 1 ? "Favorite" : "Favorites",
    },
    {
      href: "/calendar",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      value: formatLastCooked(lastCookedAt),
      label: "Last cooked",
    },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-3 px-4 sm:gap-4">
      {stats.map((s) => (
        <Link
          key={s.label}
          href={s.href}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm transition-colors hover:border-highlight/40 hover:bg-card-hover"
        >
          <span className="text-highlight">{s.icon}</span>
          <span className="font-semibold text-text">{s.value}</span>
          <span className="text-text/50">{s.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Horizontal scroll gallery with real recipe cards */
function GallerySection({
  title,
  recipes,
  seeAllHref,
}: {
  title: string;
  recipes: MinRecipe[];
  seeAllHref: string;
}) {
  if (recipes.length === 0) return null;

  return (
    <section>
      {/* Section header */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-2xl font-bold text-text">{title}</h2>
        <Link
          href={seeAllHref}
          className="text-sm font-medium text-highlight transition-opacity hover:opacity-75"
        >
          See all →
        </Link>
      </div>

      {/* Horizontal scroll row */}
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {recipes.map((r) => (
          <HomeRecipeCard
            key={r.id}
            id={r.id}
            title={r.title}
            photoUrl={r.photoUrl}
            complexity={r.complexity}
            cuisine={r.cuisine}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const user = await getCurrentUser();
  const userId = user!.id;
  const firstName = user!.displayName.split(" ")[0];

  // Realize any meal plans whose day has passed into cook logs, so plans
  // "turn into reality" on their own — stats below (and everywhere) reflect it.
  await realizePastScheduledMeals(userId);

  const select = {
    id: true,
    title: true,
    photoUrl: true,
    complexity: true,
    cuisine: true,
  } as const;

  const [
    totalRecipes,
    totalFavorites,
    lastCookLog,
    recentlyAdded,
    favorites,
    mostCooked,
    backdropRecipes,
  ] = await Promise.all([
    prisma.recipe.count({ where: { userId } }),
    prisma.recipe.count({ where: { userId, isFavorite: true } }),
    prisma.cookLog.findFirst({
      where: { userId },
      orderBy: { cookedAt: "desc" },
      select: { cookedAt: true },
    }),
    prisma.recipe.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select,
    }),
    prisma.recipe.findMany({
      where: { userId, isFavorite: true },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select,
    }),
    prisma.recipe.findMany({
      where: { userId, cookCount: { gt: 0 } },
      orderBy: { cookCount: "desc" },
      take: 12,
      select,
    }),
    getBackdropRecipes(userId),
  ]);

  return (
    <div>
      {/* ── Hero (stats + welcome centered together) ──────────────────── */}
      <section className="relative flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center overflow-hidden py-12 text-center">
        {/* Ambient recipe-journal collage, masked away from the center */}
        <HeroRecipeBackdrop recipes={backdropRecipes ?? undefined} />

        {/* Foreground content sits above the backdrop */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Stats bar sits directly above the welcome text */}
          <StatsBar
            totalRecipes={totalRecipes}
            totalFavorites={totalFavorites}
            lastCookedAt={lastCookLog?.cookedAt ?? null}
          />

          <p className="mt-8 font-brand text-6xl font-normal leading-tight text-text sm:text-7xl">
            Welcome Back to
          </p>
          <Logo className="mt-2 text-6xl sm:text-7xl" variant="page" />

          <p className="mt-10 text-xl font-semibold text-text">
            What are we cooking today, {firstName}?
          </p>

          <HeroSearch />
        </div>
      </section>

      {/* ── Gallery sections ──────────────────────────────────────────── */}
      <div className="space-y-12 px-1 pb-16">
        <GallerySection
          title="Recently Added"
          recipes={recentlyAdded}
          seeAllHref="/recipes"
        />
        <GallerySection
          title="Favorites"
          recipes={favorites}
          seeAllHref="/recipes?favorites=true"
        />
        <GallerySection
          title="Most Cooked"
          recipes={mostCooked}
          seeAllHref="/recipes"
        />

        {/* If no recipes at all, show a gentle nudge */}
        {totalRecipes === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-lg font-semibold text-text">
              Your recipe bank is empty!
            </p>
            <p className="text-sm text-text/60">
              Add your first recipe to see it appear here.
            </p>
            <Link
              href="/recipes/new"
              className="mt-2 rounded-xl bg-highlight px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Add your first recipe
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
