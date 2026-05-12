"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { getSocket, disconnectSocket } from "@/lib/socket";

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

  // Fetch unread count ONCE when user logs in — socket keeps it live after that
  useEffect(() => {
    if (!user) {
      Promise.resolve().then(() => setUnread(0));
      return;
    }
    api
      .get("/notifications?limit=1")
      .then((r) => setUnread(r.data.unreadCount ?? 0))
      .catch(() => {});
    // No polling interval — real-time updates come via socket below
  }, [user, user?.id]); // only re-run when the logged-in user actually changes

  // Listen for real-time notifications via socket → increment badge
  // If user is already on /notifications, skip the increment — just re-fetch
  useEffect(() => {
    if (!user) return;
    const sock = getSocket();
    const onNew = () => {
      if (pathname !== "/notifications") {
        setUnread((n) => n + 1);
      }
      qc.refetchQueries({ queryKey: ["notifications"] });
    };
    sock.on("notification:new", onNew);
    return () => {
      sock.off("notification:new", onNew);
    };
  }, [user, user?.id, qc, pathname]);

  // Reset badge when visiting notifications page
  useEffect(() => {
    if (pathname === "/notifications" && unread !== 0) {
      Promise.resolve().then(() => setUnread(0));
    }
  }, [pathname, unread]);


  return (
    <nav
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--text)",
        padding: "0 4rem",
        height: "var(--navbar-h)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* ── BRAND ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "3.5rem" }}>
        <Link
          href="/"
          style={{
            fontWeight: 900,
            fontSize: "13px",
            color: "var(--text)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              background: "var(--accent)",
            }}
          />
          AuctionHaus
        </Link>

        {/* ── NAV LINKS ── */}
        <div style={{ display: "flex", gap: "2rem" }}>
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

      {/* ── AUTH / SESSION ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {isHydrated && (
          user ? (
            <>
              {/* Notifications */}
              <Link
                href="/notifications"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  border: `1px solid ${unread > 0 ? "var(--accent)" : "var(--border)"}`,
                  background: unread > 0 ? "rgba(225,45,45,0.05)" : "transparent",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: unread > 0 ? "var(--accent)" : "var(--muted)",
                }}
              >
                Alerts
                {unread > 0 && (
                  <span style={{ fontFamily: "monospace" }}>
                    [{unread > 99 ? "99+" : unread}]
                  </span>
                )}
              </Link>

              <Link
                href="/profile"
                style={{
                  fontSize: "11px",
                  color: "var(--text)",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "0 0.5rem",
                }}
              >
                {user.name}
              </Link>

              <button
                onClick={handleLogout}
                style={{
                  fontSize: "10px",
                  color: "var(--muted)",
                  background: "none",
                  border: "none",
                  padding: "0.5rem 0",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                style={{
                  fontSize: "11px",
                  color: "var(--text)",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "0.5rem 1rem",
                }}
              >
                Access
              </Link>
              <Link
                href="/register"
                className="btn-primary"
                style={{
                  fontSize: "10px",
                  padding: "0.5rem 1.25rem",
                }}
              >
                Join
              </Link>
            </>
          )
        )}
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
        fontSize: "11px",
        color: active ? "var(--text)" : "var(--muted)",
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        paddingBottom: "4px",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "all 0.1s",
      }}
    >
      {children}
    </Link>
  );
}
