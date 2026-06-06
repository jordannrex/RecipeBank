import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export function Input({ className, error, id, ...props }: InputProps) {
  return (
    <div>
      <input
        id={id}
        className={cn(
          "w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors",
          "placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20",
          error ? "border-destructive" : "border-border",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
