import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Rowdies, Caveat, Patrick_Hand } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rowdies = Rowdies({
  variable: "--font-rowdies",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

// Handwriting fonts for the recipe-journal hero backdrop.
// Caveat = flowing script for titles; Patrick Hand = neat print for body lines.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  applicationName: "RecipeBank",
  title: "RecipeBank",
  description: "AI-powered recipe management, meal planning, and shopping lists",
  // Drives the iOS "Add to Home Screen" full-screen experience.
  appleWebApp: {
    capable: true,
    title: "RecipeBank",
    statusBarStyle: "default",
  },
  // Next emits the modern `mobile-web-app-capable`; older iOS Safari still
  // reads the legacy `apple-` prefixed tag, so include it too for full-screen.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // Status-bar / theme tint that follows light vs dark mode.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8b8b8" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Injected before hydration so the correct theme class is present immediately,
// preventing any flash of the wrong mode.
const themeScript = `
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${rowdies.variable} ${caveat.variable} ${patrickHand.variable} antialiased`}
      >
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
