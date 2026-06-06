"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type NavLinkProps = {
  href: string;
  /** When true, renders in brand-red (--highlight). False = current text color. */
  active: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
};

/**
 * Navigation link.
 * Active state is indicated ONLY by brand-red — no underline, background, or bold weight.
 * Inactive links use the current --text color (adapts to light / dark mode).
 */
export function NavLink({ href, active, children, className, onClick }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "font-brand text-base font-medium transition-colors",
        active ? "text-highlight" : "text-brand-white dark:text-brand-black hover:text-highlight/80",
        className,
      )}
    >
      {children}
    </Link>
  );
}
