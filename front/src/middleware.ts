import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Middleware for Route Protection
 *
 * This runs on the Edge before pages render. It checks for the
 * auth token cookie/header and redirects unauthenticated users
 * away from protected routes, and authenticated users away from
 * auth pages (login/register).
 *
 * Note: The actual token is stored in localStorage (client-side),
 * so this middleware checks for a lightweight "ah_logged_in" cookie
 * that is set alongside localStorage. This prevents the brief
 * content flash that happens with client-side-only guards.
 */

const PROTECTED_ROUTES = [
  "/dashboard",
  "/wallet",
  "/watchlist",
  "/notifications",
  "/profile",
  "/auctions/create",
  "/admin",
];

const AUTH_ROUTES = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.get("ah_logged_in")?.value === "1";

  // Redirect unauthenticated users away from protected routes
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (isProtected && !hasToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  const isAuthPage = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  if (isAuthPage && hasToken) {
    return NextResponse.redirect(new URL("/auctions", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/wallet/:path*",
    "/watchlist/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/auctions/create/:path*",
    "/admin/:path*",
    "/login",
    "/register",
  ],
};
