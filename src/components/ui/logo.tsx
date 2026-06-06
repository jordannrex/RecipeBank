import { cn } from "@/lib/utils";

type LogoProps = {
  /** Extra classes — e.g. to control font-size */
  className?: string;
  /**
   * "banner" (default) — "Bank" uses --logo-primary (white in light, black in dark),
   *   correct for the pink nav banner.
   * "page" — "Bank" uses text-text (black in light, white in dark),
   *   correct for normal page backgrounds.
   */
  variant?: "banner" | "page";
};

/**
 * RecipeBank wordmark.
 * "Recipe" always renders in brand-red (#ff3131).
 * "Bank" color depends on variant — see LogoProps.
 * Always uses the Rowdies brand font.
 */
export function Logo({ className, variant = "banner" }: LogoProps) {
  return (
    <span
      className={cn("font-brand font-normal leading-none tracking-tight", className)}
    >
      <span className="text-logo-accent">Recipe</span>
      <span className={variant === "page" ? "text-text" : "text-logo-primary"}>Bank</span>
    </span>
  );
}
