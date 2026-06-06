import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-foreground">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">Enter and confirm your new password below</p>

      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
