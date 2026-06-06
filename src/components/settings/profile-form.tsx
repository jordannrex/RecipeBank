"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthUser } from "@/types/auth";

const schema = z.object({
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(128, "Display name must be at most 128 characters"),
  avatarUrl: z.union([z.string().url("Must be a valid URL"), z.literal("")]).optional(),
});

type Props = { user: AuthUser };

export function ProfileForm({ user }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [errors, setErrors] = useState<{ displayName?: string; avatarUrl?: string }>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDirty = displayName !== user.displayName || avatarUrl !== (user.avatarUrl ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setErrorMsg(null);

    const parsed = schema.safeParse({ displayName, avatarUrl: avatarUrl || undefined });
    if (!parsed.success) {
      const errs: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof typeof errors;
        if (!errs[field]) errs[field] = issue.message;
      }
      setErrors(errs);
      return;
    }

    setStatus("saving");

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          avatarUrl: avatarUrl || null,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setErrorMsg(result.error ?? "Failed to update profile");
        setStatus("error");
        return;
      }

      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMsg ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </div>
      ) : null}

      <div>
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors.displayName}
          disabled={status === "saving"}
        />
      </div>

      <div>
        <Label htmlFor="avatarUrl">Avatar URL <span className="font-normal text-muted">(optional)</span></Label>
        <Input
          id="avatarUrl"
          name="avatarUrl"
          type="url"
          placeholder="https://example.com/photo.jpg"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          error={errors.avatarUrl}
          disabled={status === "saving"}
        />
        <p className="mt-1 text-xs text-muted">Paste a direct link to an image. Photo upload coming in a future update.</p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!isDirty || status === "saving"}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </Button>
        {status === "saved" ? (
          <span className="text-sm text-emerald-600">Profile updated.</span>
        ) : null}
      </div>
    </form>
  );
}
