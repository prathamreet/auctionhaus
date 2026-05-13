"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api, { parseApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { reconnectSocket } from "@/lib/socket";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      setAuth(res.data.user, res.data.token);
      reconnectSocket();
      router.push("/auctions");
    } catch (e: unknown) {
      setErr(parseApiError(e, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - var(--navbar-h))",
        display: "grid",
        gridTemplateColumns: "1fr 1fr" }}
    >
      {/* Left — Brand panel */}
      <div
        style={{
          background: "#111111",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "3.5rem",
          borderRight: "1px solid var(--border)" }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "3rem" }}
          >
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#c41e1e" }}
            />
            <span
              style={{
                color: "#fff",
                fontWeight: 600,
                fontSize: "var(--font-base)" }}
            >
              AuctionHaus
            </span>
          </div>

          <h2
            style={{
              fontSize: "clamp(2rem, 4vw, 3.5rem)",
              fontWeight: 600,

              lineHeight: 0.95,
              color: "#fff",
              marginBottom: "1.5rem" }}
          >
            Bid.
            <br />
            Win.
            <br />
            <span style={{ color: "#c41e1e" }}>Sell.</span>
          </h2>

          <p
            style={{
              fontSize: "var(--font-base)",
              color: "#888",
              lineHeight: 1.6,
              maxWidth: 320 }}
          >
            Real-time auctions with English, Dutch, and Sealed-bid formats.
            Auto-bid engine included.
          </p>
        </div>

        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "#555" }}
        >
          CSE Major Project · Real-Time Platform
        </div>
      </div>

      {/* Right — Form */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem",
          background: "var(--bg)" }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div
            style={{
              marginBottom: "2rem" }}
          >
            <h1
              style={{
                fontSize: "var(--font-xl)",
                fontWeight: 600,

                marginBottom: "0.4rem" }}
            >
              Sign In
            </h1>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--muted)" }}>
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                style={{
                  color: "var(--accent)",
                  fontWeight: 700,
                  textDecoration: "underline" }}
              >
                Register
              </Link>
            </p>
          </div>

          {err && (
            <div
              style={{
                padding: "0.7rem 0.9rem",
                background: "rgba(196,30,30,0.08)",
                border: "1.5px solid var(--accent)",
                color: "var(--accent)",
                fontSize: "var(--font-sm)",
                fontWeight: 600,
                marginBottom: "1.25rem" }}
            >
              {err}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}
          >
            <div>
              <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: 700, fontSize: "var(--font-xs)" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="alice@example.com"
                style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", padding: "0.85rem 1rem", background: "var(--surface)", width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: 700, fontSize: "var(--font-xs)" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", padding: "0.85rem 1rem", background: "var(--surface)", width: "100%" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ width: "100%", padding: "1rem", marginTop: "0.5rem", borderRadius: "var(--radius)",   fontWeight: 500 }}
            >
              {loading ? "SIGNING IN..." : "SIGN IN →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
