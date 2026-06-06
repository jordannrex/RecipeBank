import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  fullWidth?: boolean;
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
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-amber-700 focus:ring-2 focus:ring-primary/30",
        variant === "ghost" && "text-foreground hover:bg-stone-100",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
