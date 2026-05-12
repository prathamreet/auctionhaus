"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  title: string;
  description: string;
  type: string;
  startingPrice: string;
  reservePrice: string;
  buyNowPrice: string;
  minIncrement: string;
  antiSnipingMins: string;
  startTime: string;
  endTime: string;
  dutchPriceStep: string;
  dutchInterval: string;
};

type FieldErrors = Record<string, string>;

// ─── Client-side validation ───────────────────────────────────────────────────
function validate(form: FormState): FieldErrors {
  const errs: FieldErrors = {};

  if (!form.title.trim()) errs.title = "Title is required.";
  else if (form.title.trim().length < 3) errs.title = "Title must be at least 3 characters.";
  else if (form.title.trim().length > 200) errs.title = "Title must be 200 characters or fewer.";

  if (form.description.trim().length > 0 && form.description.trim().length < 10)
    errs.description = "Description must be at least 10 characters (or leave it empty).";

  const price = parseFloat(form.startingPrice);
  if (!form.startingPrice || isNaN(price) || price <= 0)
    errs.startingPrice = "Starting price must be a positive number.";

  const reserve = parseFloat(form.reservePrice);
  if (form.reservePrice && (isNaN(reserve) || reserve < 0))
    errs.reservePrice = "Reserve price must be a non-negative number.";

  if (form.type !== "DUTCH") {
    // minIncrement only relevant for English / Sealed
    const inc = parseFloat(form.minIncrement);
    if (!form.minIncrement || isNaN(inc) || inc <= 0)
      errs.minIncrement = "Minimum increment must be a positive number.";

    const buyNow = parseFloat(form.buyNowPrice);
    if (form.buyNowPrice && (isNaN(buyNow) || buyNow <= 0))
      errs.buyNowPrice = "Buy now price must be a positive number.";

    // endTime required for non-Dutch
    if (form.endTime) {
      const end = new Date(form.endTime);
      if (isNaN(end.getTime())) errs.endTime = "Please enter a valid end time.";
      else if (end <= new Date()) errs.endTime = "End time must be in the future.";
      if (form.startTime) {
        const start = new Date(form.startTime);
        if (!isNaN(start.getTime()) && start >= end)
          errs.endTime = "End time must be after the start time.";
      }
    } else {
      errs.endTime = "End time is required.";
    }
  }

  if (form.type === "DUTCH") {
    const step = parseFloat(form.dutchPriceStep);
    if (!form.dutchPriceStep || isNaN(step) || step <= 0)
      errs.dutchPriceStep = "Price drop step must be a positive number.";
    const interval = parseInt(form.dutchInterval);
    if (!form.dutchInterval || isNaN(interval) || interval < 60)
      errs.dutchInterval = "Drop interval must be at least 60 seconds.";
  }

  return errs;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CreateAuctionPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    type: "ENGLISH",
    startingPrice: "",
    reservePrice: "",
    buyNowPrice: "",
    minIncrement: "100",
    antiSnipingMins: "5",
    startTime: "",
    endTime: "",
    dutchPriceStep: "",
    dutchInterval: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof FormState, v: string) => {
    setForm((p) => {
      const next = { ...p, [k]: v };
      // Clear irrelevant fields when auction type changes to prevent state bleed
      if (k === "type") {
        if (v === "DUTCH") {
          // Dutch doesn't use minIncrement, buyNowPrice, antiSnipingMins, endTime
          next.minIncrement = "";
          next.buyNowPrice = "";
          next.antiSnipingMins = "";
          next.endTime = "";
        } else {
          // English/Sealed don't use dutchPriceStep, dutchInterval
          next.dutchPriceStep = "";
          next.dutchInterval = "";
          if (!next.minIncrement) next.minIncrement = "100";
          if (!next.antiSnipingMins) next.antiSnipingMins = "5";
        }
      }
      return next;
    });
    // Clear the error for this field as the user types
    if (fieldErrors[k]) setFieldErrors((p) => ({ ...p, [k]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError("");

    // Client-side validation first
    const clientErrors = validate(form);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const toISO = (val: string) => (val ? new Date(val).toISOString() : undefined);
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        startingPrice: parseFloat(form.startingPrice),
        reservePrice: parseFloat(form.reservePrice) || undefined,
        startTime: toISO(form.startTime) ?? new Date().toISOString(),
      };
      if (form.type !== "DUTCH") {
        body.endTime = toISO(form.endTime);
        body.minIncrement = parseFloat(form.minIncrement);
        body.antiSnipingMins = parseInt(form.antiSnipingMins);
        if (form.buyNowPrice) body.buyNowPrice = parseFloat(form.buyNowPrice);
      }
      if (form.type === "DUTCH") {
        body.dutchPriceStep = parseFloat(form.dutchPriceStep);
        body.dutchInterval = parseInt(form.dutchInterval);
      }
      const res = await api.post("/auctions", body);
      router.push(`/auctions/${res.data.id}`);
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { message?: string; errors?: Record<string, string> } };
      };
      const data = err.response?.data;
      if (data?.errors && typeof data.errors === "object") {
        // Server returned per-field validation errors
        setFieldErrors(data.errors);
        setGlobalError(data.message || "Please fix the errors below and try again.");
      } else {
        setGlobalError(data?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = Object.values(fieldErrors).some(Boolean);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "4rem 4vw" }}>
      <h1 style={{ fontWeight: 900, fontSize: "2rem", letterSpacing: "-0.03em", marginBottom: "0.5rem", textTransform: "uppercase" }}>
        Create Auction
      </h1>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "2rem" }}>
        Fill in the details below to list your item for auction.
      </p>

      {/* Global error banner */}
      {(globalError || hasErrors) && (
        <div style={bannerStyle}>
          <span style={{ fontWeight: 800 }}>WARNING:</span>
          <span>{globalError || "Please fix the highlighted fields below."}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }} noValidate>

        <Field label="Title *" error={fieldErrors.title}>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Vintage Rolex Submariner"
            style={inputStyle(!!fieldErrors.title)}
          />
        </Field>

        <Field label="Description" hint="Min 10 characters if provided" error={fieldErrors.description}>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Describe your item — condition, history, dimensions…"
            style={{ ...inputStyle(!!fieldErrors.description), resize: "vertical" }}
          />
        </Field>

        <Field label="Auction Type">
          <select value={form.type} onChange={(e) => set("type", e.target.value)} style={inputStyle(false)}>
            <option value="ENGLISH">English — price climbs up with bids</option>
            <option value="DUTCH">Dutch — price drops until someone buys</option>
            <option value="SEALED_BID">Sealed Bid — blind, highest bid wins</option>
          </select>
        </Field>

        <div style={gridTwo}>
          <Field label="Starting Price (₹) *" error={fieldErrors.startingPrice}>
            <input
              type="number"
              value={form.startingPrice}
              onChange={(e) => set("startingPrice", e.target.value)}
              placeholder="e.g. 5000"
              min="1"
              style={inputStyle(!!fieldErrors.startingPrice)}
            />
          </Field>
          <Field label="Reserve Price (₹)" hint="Optional minimum to sell" error={fieldErrors.reservePrice}>
            <input
              type="number"
              value={form.reservePrice}
              onChange={(e) => set("reservePrice", e.target.value)}
              placeholder="e.g. 8000"
              min="0"
              style={inputStyle(!!fieldErrors.reservePrice)}
            />
          </Field>
        </div>

        {/* Min increment + buy now — not relevant for Dutch */}
        {form.type !== "DUTCH" && (
          <div style={gridTwo}>
            <Field label="Min Bid Increment (₹) *" error={fieldErrors.minIncrement}>
              <input
                type="number"
                value={form.minIncrement}
                onChange={(e) => set("minIncrement", e.target.value)}
                placeholder="e.g. 100"
                min="1"
                style={inputStyle(!!fieldErrors.minIncrement)}
              />
            </Field>
            <Field label="Buy Now Price (₹)" hint="Optional instant-buy price" error={fieldErrors.buyNowPrice}>
              <input
                type="number"
                value={form.buyNowPrice}
                onChange={(e) => set("buyNowPrice", e.target.value)}
                placeholder="e.g. 15000"
                min="1"
                style={inputStyle(!!fieldErrors.buyNowPrice)}
              />
            </Field>
          </div>
        )}

        {/* Dutch-specific fields */}
        {form.type === "DUTCH" && (
          <>
            <div style={gridTwo}>
              <Field label="Price Drop Step (₹) *" error={fieldErrors.dutchPriceStep}>
                <input
                  type="number"
                  value={form.dutchPriceStep}
                  onChange={(e) => set("dutchPriceStep", e.target.value)}
                  placeholder="e.g. 200"
                  min="1"
                  style={inputStyle(!!fieldErrors.dutchPriceStep)}
                />
              </Field>
              <Field label="Drop Interval (seconds) *" hint="Min 60 s" error={fieldErrors.dutchInterval}>
                <input
                  type="number"
                  value={form.dutchInterval}
                  onChange={(e) => set("dutchInterval", e.target.value)}
                  placeholder="e.g. 300"
                  min="60"
                  style={inputStyle(!!fieldErrors.dutchInterval)}
                />
              </Field>
            </div>
            {/* Show computed duration hint */}
            {form.startingPrice && form.dutchPriceStep && form.dutchInterval && (() => {
              const start = parseFloat(form.startingPrice);
              const step = parseFloat(form.dutchPriceStep);
              const interval = parseInt(form.dutchInterval);
              const floor = parseFloat(form.reservePrice) || 0;
              if (!isNaN(start) && !isNaN(step) && !isNaN(interval) && step > 0 && interval > 0) {
                const drops = Math.ceil((start - floor) / step);
                const totalSecs = drops * interval;
                const h = Math.floor(totalSecs / 3600);
                const m = Math.floor((totalSecs % 3600) / 60);
                const s = totalSecs % 60;
                const durText = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
                return (
                  <div style={{ fontSize: "0.78rem", color: "var(--text)", fontWeight: 600, marginTop: "-0.75rem", padding: "1rem", border: "1.5px solid var(--border-hard)", borderRadius: 0, background: "var(--surface-2)" }}>
                    INFO: Auction will last approximately <strong>{durText}</strong> ({drops} drops × {interval}s)
                    — end time is auto-computed.
                  </div>
                );
              }
              return null;
            })()}
          </>
        )}

        {/* Anti-Sniping — not relevant for Dutch */}
        {form.type !== "DUTCH" && (
          <Field label="Anti-Sniping Window (minutes)" hint="Extends auction if bid placed near end (0–30)">
            <input
              type="number"
              value={form.antiSnipingMins}
              onChange={(e) => set("antiSnipingMins", e.target.value)}
              min="0"
              max="30"
              style={inputStyle(false)}
            />
          </Field>
        )}

        <div style={gridTwo}>
          <Field label="Start Time" hint="Leave blank to start immediately" error={fieldErrors.startTime}>
            <input
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              style={inputStyle(!!fieldErrors.startTime)}
            />
          </Field>
          {form.type !== "DUTCH" && (
            <Field label="End Time *" error={fieldErrors.endTime}>
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                required
                style={inputStyle(!!fieldErrors.endTime)}
              />
            </Field>
          )}
        </div>


        <button type="submit" disabled={loading} style={submitStyle(loading)}>
          {loading ? "CREATING AUCTION…" : "CREATE AUCTION"}
        </button>
      </form>
    </div>
  );
}

// ─── Field wrapper ─────────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem" }}>
        <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)" }}>{label}</label>
        {hint && !error && (
          <span style={{ fontSize: "0.72rem", color: "var(--muted)", opacity: 0.7 }}>{hint}</span>
        )}
      </div>
      {children}
      {error && (
        <p style={fieldErrStyle}>{error}</p>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const gridTwo: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "1rem",
};

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  border: hasError ? "1.5px solid #ef4444" : "1.5px solid var(--border-hard)",
  borderRadius: 0,
  padding: "0.85rem 1rem",
  fontSize: "0.95rem",
  fontWeight: 500,
  background: "var(--surface)",
  color: "var(--text)",
  outline: "none",
  transition: "border-color 0.15s",
});

const bannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  background: "var(--surface)",
  border: "1.5px solid #ef4444",
  color: "#ef4444",
  borderRadius: 0,
  padding: "1rem",
  fontSize: "0.85rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "1rem",
};

const fieldErrStyle: React.CSSProperties = {
  marginTop: "0.5rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#ef4444",
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const submitStyle = (loading: boolean): React.CSSProperties => ({
  background: "var(--text)",
  color: "var(--bg)",
  border: "1.5px solid var(--text)",
  borderRadius: 0,
  padding: "1rem",
  fontWeight: 800,
  fontSize: "0.95rem",
  letterSpacing: "0.05em",
  cursor: loading ? "not-allowed" : "pointer",
  marginTop: "1rem",
  transition: "opacity 0.2s",
  opacity: loading ? 0.5 : 1,
});
