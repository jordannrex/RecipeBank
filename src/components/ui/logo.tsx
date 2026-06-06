import { cn } from "@/lib/utils";

type LogoProps = {
  /** Extra classes — e.g. to control font-size */
  className?: string;
};

/**
 * RecipeBank wordmark.
 * "Recipe" renders in brand-red (#ff3131 / --logo-accent).
 * "Bank"   renders in brand-black (light) / brand-white (dark) via --logo-primary.
 * Always uses the Rowdies brand font.
 */
export function Logo({ className }: LogoProps) {
  return (
    <span
      className={cn("font-brand font-normal leading-none tracking-tight", className)}
    >
      <span className="text-logo-accent">Recipe</span>
      <span className="text-logo-primary">Bank</span>
    </span>
  );
}
