import type { AvatarConfig } from "@/types/auth";

/** Returns white or black depending on which gives better contrast against a hex bg. */
export function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128 ? "#ffffff" : "#000000";
}

type AvatarDisplayProps = {
  config: AvatarConfig | null;
  /** Fallback text when no config (uses first 2 chars). */
  fallback?: string;
  size?: number;
  className?: string;
};

/**
 * Renders an avatar from an AvatarConfig — either a colored initials circle or a photo.
 * Falls back to a red initials circle using `fallback` text.
 */
export function AvatarDisplay({
  config,
  fallback = "?",
  size = 32,
  className,
}: AvatarDisplayProps) {
  const dim = { width: size, height: size };
  const rounded = "rounded-full object-cover flex-shrink-0";

  if (!config) {
    const letter = fallback.slice(0, 2).toUpperCase();
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold ${className ?? ""}`}
        style={{ ...dim, backgroundColor: "#ff3131", color: "#ffffff", fontSize: size * 0.4 }}
      >
        {letter}
      </span>
    );
  }

  if (config.type === "photo") {
    if (!config.url) {
      // Empty URL — render safe fallback instead of <img src="">
      const letter = fallback.slice(0, 2).toUpperCase();
      return (
        <span
          className={`inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold ${className ?? ""}`}
          style={{ ...dim, backgroundColor: "#ff3131", color: "#ffffff", fontSize: size * 0.4 }}
        >
          {letter}
        </span>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={config.url} alt="Avatar" className={`${rounded} ${className ?? ""}`} style={dim} />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold ${className ?? ""}`}
      style={{
        ...dim,
        backgroundColor: config.bgColor,
        color: contrastText(config.bgColor),
        fontSize: size * 0.42,
      }}
    >
      {config.letter.toUpperCase()}
    </span>
  );
}
