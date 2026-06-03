import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Proxy (formerly "middleware") for Route Protection
 *
 * Runs on the Edge before pages render. Checks for the lightweight
 * "ah_logged_in" cookie (set alongside the localStorage token) and:
 *   - redirects unauthenticated users away from protected routes
 *   - redirects authenticated users away from auth pages (login/register)
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`; the
 * function is exported as `proxy` and the file lives at src/proxy.ts.
 * Behaviour and the `config.matcher` are unchanged from the prior
 * middleware implementation.
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

export function proxy(request: NextRequest) {
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
