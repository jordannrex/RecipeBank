import Link from "next/link";

type Complexity = "EASY" | "MEDIUM" | "HARD" | "NONE";

type HomeRecipeCardProps = {
  id: string;
  title: string;
  photoUrl: string | null;
  complexity: Complexity;
  cuisine: string | null;
};

const complexityColor: Record<Exclude<Complexity, "NONE">, string> = {
  EASY: "#22c55e",
  MEDIUM: "#f59e0b",
  HARD: "#ef4444",
};

export function HomeRecipeCard({
  id,
  title,
  photoUrl,
  complexity,
  cuisine,
}: HomeRecipeCardProps) {
  return (
    <Link href={`/recipes/${id}`} className="group w-36 flex-none sm:w-40">
      {/* Square photo area */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-card-hover">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {/* Plate / fork placeholder icon */}
            <svg
              className="h-10 w-10 text-border"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
              <circle cx="12" cy="12" r="9" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {/* Complexity dot — bottom-right corner (hidden when unset) */}
        {complexity !== "NONE" && (
          <span
            className="absolute bottom-2 right-2 h-2.5 w-2.5 rounded-full ring-2 ring-card"
            style={{ backgroundColor: complexityColor[complexity] }}
            aria-label={complexity.toLowerCase()}
          />
        )}
      </div>

      {/* Title */}
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-tight text-text">
        {title}
      </p>

      {/* Cuisine (optional sub-label) */}
      {cuisine && (
        <p className="mt-0.5 truncate text-xs text-text/50">{cuisine}</p>
      )}
    </Link>
  );
}
