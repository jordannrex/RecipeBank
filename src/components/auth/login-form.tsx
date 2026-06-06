"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginFormValues } from "@/lib/auth/validation";

type FieldErrors = Partial<Record<keyof LoginFormValues, string>>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const values = { identifier, password, rememberMe };
    const parsed = loginSchema.safeParse(values);

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof LoginFormValues;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const result = await response.json();

      if (!response.ok) {
        setFormError(result.error ?? "Invalid email/username or password");
        return;
      }

      const next = searchParams.get("next");
      router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/home");
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </div>
      ) : null}

      <div>
        <Label htmlFor="identifier">Email or username</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          error={fieldErrors.identifier}
          disabled={isSubmitting}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label htmlFor="password" className="mb-0">
            Password
          </Label>
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          disabled={isSubmitting}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
          disabled={isSubmitting}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
        />
        Remember me
      </label>

      <Button type="submit" fullWidth disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
