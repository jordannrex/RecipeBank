import { cn } from "@/lib/utils";

type CardProps = {
  /** Optional 16:9 photo. When omitted, a placeholder with a plate icon is shown. */
  photoUrl?: string | null;
  /** Alt text for the photo. Required when photoUrl is provided for accessibility. */
  photoAlt?: string;
  title?: string;
  children?: React.ReactNode;
  className?: string;
};

/** Plate-and-utensils placeholder SVG — rendered when no photo is supplied. */
function PhotoPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#1c1c1e]">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#71717a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Plate */}
        <circle cx="12" cy="13" r="5" />
        <path d="M12 8v1" />
        {/* Fork */}
        <path d="M5 3v4c0 1.1.9 2 2 2s2-.9 2-2V3" />
        <path d="M7 9v12" />
        {/* Knife */}
        <path d="M17 3c0 0 2 1.5 2 4s-2 4-2 4v9" />
      </svg>
    </div>
  );
}

/**
 * Rectangular content card with an optional 16:9 photo slot.
 * All colors reference CSS variables — adapts automatically to light / dark mode.
 */
export function Card({ photoUrl, photoAlt, title, children, className }: CardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* 16:9 photo area */}
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <div className="absolute inset-0">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={photoAlt ?? title ?? "Recipe photo"}
              className="h-full w-full object-cover"
            />
          ) : (
            <PhotoPlaceholder />
          )}
        </div>
      </div>

      {/* Text content */}
      {(title || children) && (
        <div className="p-4">
          {title && (
            <h3 className="text-sm font-semibold text-text leading-snug">{title}</h3>
          )}
          {children && (
            <div className="mt-1 text-xs text-muted">{children}</div>
          )}
        </div>
      )}
    </div>
  );
}
