import { Logo } from "@/components/ui/logo";

// Shown by the service worker when a page navigation fails with no connection.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Logo className="text-4xl" variant="page" />
      <p className="text-lg font-semibold text-text">You&apos;re offline</p>
      <p className="max-w-xs text-sm text-muted">
        RecipeBank needs a connection to load this page. Check your network and try again.
      </p>
    </div>
  );
}
