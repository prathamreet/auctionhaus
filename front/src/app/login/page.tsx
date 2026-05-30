"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api, { parseApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { reconnectSocket } from "@/lib/socket";
import { loginSchema } from "@/lib/contracts";
import { useZodForm } from "@/lib/useZodForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { AuthHeroPanel } from "@/components/AuthHeroPanel";

export default function LoginPage() {
  const { setAuth } = useAuthStore();
  const router = useRouter();

  const form = useZodForm(loginSchema, { email: "", password: "" });

  const submit = form.onSubmit(async (data) => {
    try {
      const res = await api.post("/auth/login", data);
      setAuth(res.data.user, res.data.token);
      reconnectSocket();
      router.push("/auctions");
    } catch (e) {
      form.setGlobalError(parseApiError(e, "Login failed"));
    }
  });

  return (
    <div
      className="auth-grid"
      style={{
        minHeight: "calc(100vh - var(--navbar-h))",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      }}
    >
      <AuthHeroPanel
        heading={
          <>
            Bid.
            <br />
            Win.
            <br />
            <span style={{ color: "var(--accent)" }}>Settle.</span>
          </>
        }
        body="Real-time English, Dutch, and sealed-bid auctions on one streaming engine. Auto-bid included."
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(1.5rem, 5vw, 3rem)",
          background: "var(--bg)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: "2rem" }}>
            <h1
              style={{
                fontSize: "var(--font-2xl)",
                fontWeight: 700,
                marginBottom: "0.4rem",
                letterSpacing: "-0.02em",
              }}
            >
              Sign in
            </h1>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--muted)" }}>
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                style={{
                  color: "var(--accent)",
                  fontWeight: 700,
                  textDecoration: "underline",
                }}
              >
                Register
              </Link>
            </p>
          </div>

          {form.globalError && (
            <Alert tone="error" style={{ marginBottom: "1rem" }}>
              {form.globalError}
            </Alert>
          )}

          <form
            onSubmit={submit}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <Field label="Email" error={form.errors.email}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="alice@example.com"
                {...form.register("email")}
                value={(form.values.email as string) ?? ""}
              />
            </Field>
            <Field label="Password" error={form.errors.password}>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...form.register("password")}
                value={(form.values.password as string) ?? ""}
              />
            </Field>

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={form.submitting}
              style={{ marginTop: "0.5rem" }}
            >
              {form.submitting ? "Signing in..." : "Sign in →"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

