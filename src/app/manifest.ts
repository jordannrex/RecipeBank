import type { MetadataRoute } from "next";

// Web App Manifest — makes RecipeBank installable to the iOS/Android home
// screen and launches it full-screen (no browser chrome). Next.js serves this
// at /manifest.webmanifest and injects the <link rel="manifest"> automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RecipeBank",
    short_name: "RecipeBank",
    description: "AI-powered recipe management, meal planning, and shopping lists",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#e8b8b8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
