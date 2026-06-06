import Link from "next/link";
import { redirect } from "next/navigation";
import { AvatarDisplay } from "@/components/ui/avatar-display";
import { getCurrentUser } from "@/lib/auth";

function getInitials(displayName: string) {
  return displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberSince = user.createdAt.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="flex items-center gap-6">
        <AvatarDisplay
          config={user.avatarConfig}
          fallback={getInitials(user.displayName)}
          size={80}
        />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{user.displayName}</h1>
          <p className="text-sm text-muted">@{user.username}</p>
        </div>
      </div>

      <dl className="divide-y divide-border rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm font-medium text-foreground">Email</dt>
          <dd className="text-sm text-muted">{user.email}</dd>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm font-medium text-foreground">Username</dt>
          <dd className="text-sm text-muted">@{user.username}</dd>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm font-medium text-foreground">Member since</dt>
          <dd className="text-sm text-muted">{memberSince}</dd>
        </div>
      </dl>

      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-stone-50 transition-colors"
        >
          Edit profile in Settings →
        </Link>
      </div>
    </div>
  );
}
