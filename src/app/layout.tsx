import type { Metadata } from "next";
import { Geist, Geist_Mono, Rowdies } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "RecipeBank",
  description: "AI-powered recipe management, meal planning, and shopping lists",
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
        className={`${geistSans.variable} ${geistMono.variable} ${rowdies.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
