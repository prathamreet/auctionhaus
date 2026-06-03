import { create } from "zustand";

interface User {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  avatar?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  /** true until the client has read localStorage and hydrated the store */
  isHydrated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Always start with null so SSR and the first client render match.
  // The real values are loaded from localStorage in `hydrate()` (called
  // inside a useEffect in AuthProvider) so the two environments agree.
  user: null,
  token: null,
  isHydrated: false,

  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const token = localStorage.getItem("token");
      const raw = localStorage.getItem("ah_user");
      const user: User | null = raw ? (JSON.parse(raw) as User) : null;
      // Sync the edge-proxy cookie if a token exists
      if (token) {
        document.cookie = "ah_logged_in=1;path=/;max-age=31536000;SameSite=Lax";
      }
      set({ user, token, isHydrated: true });
    } catch {
      set({ isHydrated: true });
    }
  },

  setAuth: (user, token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("token", token);
      localStorage.setItem("ah_user", JSON.stringify(user));
      // Sync cookie for Next.js edge-proxy route protection
      document.cookie = "ah_logged_in=1;path=/;max-age=31536000;SameSite=Lax";
    }
    set({ user, token });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("ah_user");
      // Clear the edge-proxy cookie
      document.cookie = "ah_logged_in=;path=/;max-age=0";
    }
    set({ user: null, token: null });
  } }));
