import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * primary   — brand-red fill, white text
   * secondary — outlined, brand-red border + text
   * ghost     — transparent, subtle hover (used internally for destructive confirm flows)
   */
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-highlight text-brand-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight/40",
  secondary:
    "border border-highlight text-highlight bg-transparent hover:bg-highlight/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight/40",
  ghost:
    "text-text bg-transparent hover:bg-text/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
};

export function Button({
  className,
  variant = "primary",
  fullWidth = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        fullWidth && "w-full",
        variantClasses[variant],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
