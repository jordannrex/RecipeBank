import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Small pill label — e.g. "Italian", "Easy".
 * Background is brand-pink (#e8b8b8 / --banner), text is --text.
 */
export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-banner px-2.5 py-0.5 text-xs font-medium text-text",
        className,
      )}
    >
      {children}
    </span>
  );
}
