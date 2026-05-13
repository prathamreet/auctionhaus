import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api" });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auth-critical paths: a 401 on these means the session is genuinely dead.
const AUTH_CRITICAL_PATHS = ["/auth/me"];

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      const url: string = err.config?.url ?? "";
      const isAuthCritical = AUTH_CRITICAL_PATHS.some((p) => url.includes(p));
      const hadToken = !!localStorage.getItem("token");

      // Only force-logout if:
      //  1. The token exists (not an anonymous call)
      //  2. The failing endpoint is a core auth endpoint (not a random query)
      if (hadToken && isAuthCritical) {
        localStorage.removeItem("token");
        localStorage.removeItem("ah_user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

/**
 * Centralized API error parser.
 * Extracts a human-readable message from Axios errors (or any unknown thrown value).
 * Usage: catch (e) { setErr(parseApiError(e)); }
 */
export function parseApiError(
  error: unknown,
  fallback = "Something went wrong"
): string {
  if (!error) return fallback;
  const err = error as {
    response?: { data?: { message?: string; errors?: Record<string, string> } };
    message?: string;
  };
  return (
    err.response?.data?.message ||
    err.message ||
    fallback
  );
}

export default api;

