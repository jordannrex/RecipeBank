"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { AvatarDisplay } from "@/components/ui/avatar-display";
import { Logo } from "@/components/ui/logo";
import { NavLink } from "@/components/ui/nav-link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";

const NAV_LINKS = [
  { href: "/home", label: "Home" },
  { href: "/recipes", label: "Recipe Bank" },
  { href: "/calendar", label: "Calendar" },
  { href: "/menus",    label: "Menus" },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = getInitials(user.displayName);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-banner backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

        {/* Wordmark */}
        <Link href="/home" aria-label="RecipeBank home">
          <Logo className="text-2xl" />
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              active={
                pathname === link.href ||
                pathname.startsWith(`${link.href}/`)
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop: theme toggle + user menu */}
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 text-base font-medium text-brand-white dark:text-brand-black"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <AvatarDisplay
                config={user.avatarConfig}
                fallback={initials}
                size={32}
              />
              <span>{user.displayName}</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-card py-1 shadow-lg">
                <Link
                  href="/profile"
                  className="block px-4 py-2 text-sm text-text transition-colors hover:bg-card-hover"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
                <Link
                  href="/settings"
                  className="block px-4 py-2 text-sm text-text transition-colors hover:bg-card-hover"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
                <LogoutButton />
              </div>
            )}
          </div>
        </div>

        {/* Mobile: theme toggle + hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-lg border border-border p-2 text-text"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <nav
          className="border-t border-border bg-banner px-4 py-4 md:hidden"
          aria-label="Mobile"
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                active={pathname === link.href || pathname.startsWith(`${link.href}/`)}
                className="py-2"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <hr className="my-3 border-border" />

          <Link
            href="/profile"
            className={cn("block py-2 text-sm text-text")}
            onClick={() => setMobileOpen(false)}
          >
            Profile
          </Link>
          <Link
            href="/settings"
            className={cn("block py-2 text-sm text-text")}
            onClick={() => setMobileOpen(false)}
          >
            Settings
          </Link>
          <LogoutButton className="px-0 py-2 text-text" />
        </nav>
      )}
    </header>
  );
}
