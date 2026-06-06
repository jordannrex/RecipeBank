"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";

const NAV_LINKS = [
  { href: "/home", label: "Home" },
  { href: "/recipes", label: "Recipe Bank" },
  { href: "/calendar", label: "Calendar" },
  { href: "/shopping", label: "Shopping List" },
];

type AppNavProps = {
  user: AuthUser;
};

function getInitials(displayName: string) {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppNav({ user }: AppNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = user.displayName;
  const initials = getInitials(displayName);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/home" className="text-lg font-bold text-primary">
          RecipeBank
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                pathname === link.href || pathname.startsWith(`${link.href}/`)
                  ? "text-primary"
                  : "text-muted",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                {initials}
              </span>
              <span>{displayName}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-40 rounded-lg border border-border bg-card py-1 shadow-lg">
              <Link href="/profile" className="block px-4 py-2 text-sm hover:bg-stone-50">
                Profile
              </Link>
              <Link href="/settings" className="block px-4 py-2 text-sm hover:bg-stone-50">
                Settings
              </Link>
              <LogoutButton />
            </div>
          </details>
        </div>

        <button
          type="button"
          className="md:hidden rounded-lg border border-border p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <nav className="border-t border-border bg-card px-4 py-4 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "block py-2 text-sm font-medium",
                pathname === link.href ? "text-primary" : "text-foreground",
              )}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <hr className="my-3 border-border" />
          <Link href="/profile" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>
            Profile
          </Link>
          <Link href="/settings" className="block py-2 text-sm" onClick={() => setMobileOpen(false)}>
            Settings
          </Link>
          <LogoutButton className="px-0 py-2" />
        </nav>
      )}
    </header>
  );
}
