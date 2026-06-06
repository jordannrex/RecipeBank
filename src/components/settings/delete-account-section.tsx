"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/auth/constants";

type Props = {
  deletionScheduledAt: Date | null;
};

export function DeleteAccountSection({ deletionScheduledAt }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scheduledDate = deletionScheduledAt ? new Date(deletionScheduledAt) : null;

  async function handleScheduleDeletion() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/user/delete-account", { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        setErrorMsg(result.error ?? "Failed to schedule deletion");
        return;
      }
      router.refresh();
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  async function handleCancelDeletion() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/user/delete-account", { method: "POST" });
      if (!response.ok) {
        const result = await response.json();
        setErrorMsg(result.error ?? "Failed to cancel deletion");
        return;
      }
      router.refresh();
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {errorMsg ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </div>
      ) : null}

      {scheduledDate ? (
        <div className="rounded-lg border border-banner bg-banner/20 p-4 space-y-3">
          <p className="text-sm text-text">
            <strong>Your account is scheduled for deletion</strong> on{" "}
            {scheduledDate.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            . All your recipes, lists, logs, and plans will be permanently removed on that date.
          </p>
          <Button variant="ghost" onClick={handleCancelDeletion} disabled={loading}>
            {loading ? "Cancelling…" : "Cancel deletion"}
          </Button>
        </div>
      ) : confirming ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm text-destructive">
            <strong>Are you sure?</strong> Your account and all associated recipes, lists, logs, and plans will be permanently deleted after a {ACCOUNT_DELETION_GRACE_DAYS}-day grace period. This cannot be undone after the grace period.
          </p>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="text-foreground"
            >
              Keep my account
            </Button>
            <button
              type="button"
              onClick={handleScheduleDeletion}
              disabled={loading}
              className="rounded-lg bg-highlight px-4 py-2 text-sm font-medium text-brand-white hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Scheduling…" : "Yes, delete my account"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Permanently delete your account and all associated data. You will have a {ACCOUNT_DELETION_GRACE_DAYS}-day grace period to change your mind.
          </p>
          <Button
            variant="ghost"
            onClick={() => setConfirming(true)}
            className="text-destructive hover:bg-destructive/5"
          >
            Delete account
          </Button>
        </div>
      )}
    </div>
  );
}
