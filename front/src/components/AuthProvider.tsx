"use client";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { token, setAuth, logout, hydrate } = useAuthStore();

  // Step 1 — runs synchronously after first paint, before any API call.
  // Reads localStorage and sets user/token in the store so the Navbar can
  // render the correct links on the client without a SSR mismatch.
  useEffect(() => {
    hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2 — validate the stored token against the server in the background.
  // If the token is expired / revoked, this logs the user out gracefully.
  useEffect(() => {
    if (!token) return;
    api
      .get("/auth/me")
      .then((res) => {
        const user = res.data;
        if (user?.id) {
          setAuth(user, token);
        } else {
          logout();
        }
      })
      .catch(() => {
        logout();
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
