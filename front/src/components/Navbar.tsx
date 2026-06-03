"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { useSocketListener } from "@/lib/useSocketListener";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";

export default function Navbar() {
  const { user, logout, isHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [unread, setUnread] = useState(0);

  const handleLogout = () => {
    disconnectSocket();
    logout();
    router.push("/login");
  };

  const isAdmin = user?.role === "ADMIN";

  // Fetch unread once on login; socket keeps it live. The badge is only
  // rendered while `user` is truthy, so there is no need to reset it to 0 on
  // logout -- the count simply stops being shown.
  useEffect(() => {
    if (!user) return;
    api
      .get("/notifications?limit=1")
      .then((r) => setUnread(r.data.unreadCount ?? 0))
      .catch(() => {});
  }, [user, user?.id]);

  // Live new-notification: bump badge (unless already viewing /notifications)
  useSocketListener(
    "notification:new",
    () => {
      if (pathname !== "/notifications") {
        setUnread((n) => n + 1);
      }
      qc.refetchQueries({ queryKey: ["notifications"] });
    },
    !!user
  );

  return (
    <nav
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 clamp(1rem, 4vw, 4rem)",
        height: "var(--navbar-h)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "2.5rem" }}>
        <Link
          href="/"
          style={{
            fontWeight: 700,
            fontSize: "var(--font-base)",
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            letterSpacing: "-0.01em",
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              background: "var(--accent)",
              borderRadius: 2,
            }}
          />
          AuctionHaus
        </Link>

        <div style={{ display: "flex", gap: "1.5rem" }}>
          <NavLink href="/auctions" active={pathname.startsWith("/auctions")}>
            Market
          </NavLink>
          {isHydrated && user && (
            <>
              <NavLink href="/dashboard" active={pathname === "/dashboard"}>
                Dashboard
              </NavLink>
              <NavLink href="/watchlist" active={pathname === "/watchlist"}>
                Watchlist
              </NavLink>
              <NavLink href="/wallet" active={pathname === "/wallet"}>
                Wallet
              </NavLink>
              {isAdmin && (
                <NavLink href="/admin" active={pathname.startsWith("/admin")}>
                  Admin
                </NavLink>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {/* Phase F2: socket connection indicator. Renders nothing when
            healthy; pulses amber when reconnecting; red when offline.
            Sits left of the auth/alerts cluster so the user catches it on
            the path their eye is already tracking. Mounted for both
            authed and anonymous users -- live bid pages work without auth
            and still need the signal. */}
        {isHydrated && <ConnectionStatus mode="full" />}
        {isHydrated &&
          (user ? (
            <>
              <Link
                href="/notifications"
                aria-label="Notifications"
                onClick={() => setUnread(0)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.4rem 0.75rem",
                  border: `1px solid ${unread > 0 ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  background:
                    unread > 0
                      ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                      : "transparent",
                  fontSize: "var(--font-xs)",
                  fontWeight: 600,
                  color: unread > 0 ? "var(--accent)" : "var(--text-soft)",
                }}
              >
                Alerts
                {unread > 0 && (
                  <span style={{ fontWeight: 700 }}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>

              <ThemeToggle />

              <Link
                href="/profile"
                style={{
                  fontSize: "var(--font-xs)",
                  color: "var(--text)",
                  fontWeight: 600,
                  padding: "0 0.5rem",
                }}
              >
                {user.name}
              </Link>

              <button
                onClick={handleLogout}
                style={{
                  fontSize: "var(--font-xs)",
                  color: "var(--muted)",
                  background: "none",
                  border: "none",
                  padding: "0.4rem 0",
                  fontWeight: 600,
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                href="/login"
                style={{
                  fontSize: "var(--font-xs)",
                  color: "var(--text)",
                  fontWeight: 600,
                  padding: "0.4rem 0.85rem",
                }}
              >
                Sign in
              </Link>
              <Link href="/register" style={{ textDecoration: "none" }}>
                <Button size="sm">Join</Button>
              </Link>
            </>
          ))}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        fontSize: "var(--font-xs)",
        color: active ? "var(--text)" : "var(--muted)",
        fontWeight: 600,
        paddingBottom: 3,
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        transition: "color 0.12s",
      }}
    >
      {children}
    </Link>
  );
}
