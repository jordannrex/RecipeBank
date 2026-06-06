import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Optional label rendered above the input field. */
  label?: string;
  error?: string;
};

export function Input({ className, label, error, id, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-sm font-medium text-text"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "w-full rounded-lg border bg-card px-3 py-2 text-sm text-text outline-none transition-colors",
          "placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20",
          error ? "border-destructive" : "border-border",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
