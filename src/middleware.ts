import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isAuthenticated = session !== null;

  // Root always redirects — to home if authenticated, to login if not.
  // Handling it here avoids the extra /home → /login hop that page.tsx caused.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(isAuthenticated ? "/home" : "/login", request.url));
  }

  if (isPublicPath(pathname)) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
