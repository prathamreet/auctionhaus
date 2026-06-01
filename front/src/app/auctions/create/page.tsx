"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api, { parseApiError } from "@/lib/api";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  PageShell,
  Select,
  Textarea,
} from "@/components/ui";

type FormState = {
  title: string;
  description: string;
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
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

type FieldErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FieldErrors {
  const e: FieldErrors = {};
  if (!form.title.trim()) e.title = "Title is required.";
  else if (form.title.trim().length < 3) e.title = "Title must be at least 3 characters.";
  else if (form.title.trim().length > 200) e.title = "Title must be 200 characters or fewer.";

  const descLen = form.description.trim().length;
  if (descLen > 0 && descLen < 10)
    e.description = "Description must be at least 10 characters (or leave it empty).";

  const price = parseFloat(form.startingPrice);
  if (!form.startingPrice || isNaN(price) || price <= 0)
    e.startingPrice = "Starting price must be a positive number.";

  if (form.reservePrice) {
    const reserve = parseFloat(form.reservePrice);
    if (isNaN(reserve) || reserve < 0)
      e.reservePrice = "Reserve price must be a non-negative number.";
  }

  if (form.type !== "DUTCH") {
    const inc = parseFloat(form.minIncrement);
    if (!form.minIncrement || isNaN(inc) || inc <= 0)
      e.minIncrement = "Minimum increment must be a positive number.";

    if (form.buyNowPrice) {
      const buyNow = parseFloat(form.buyNowPrice);
      if (isNaN(buyNow) || buyNow <= 0)
        e.buyNowPrice = "Buy now price must be a positive number.";
    }

    if (form.endTime) {
      const end = new Date(form.endTime);
      if (isNaN(end.getTime())) e.endTime = "Please enter a valid end time.";
      else if (end <= new Date()) e.endTime = "End time must be in the future.";
      if (form.startTime) {
        const start = new Date(form.startTime);
        if (!isNaN(start.getTime()) && start >= end)
          e.endTime = "End time must be after the start time.";
      }
    } else {
      e.endTime = "End time is required.";
    }
  }

  if (form.type === "DUTCH") {
    const step = parseFloat(form.dutchPriceStep);
    if (!form.dutchPriceStep || isNaN(step) || step <= 0)
      e.dutchPriceStep = "Price drop step must be a positive number.";
    const interval = parseInt(form.dutchInterval);
    if (!form.dutchInterval || isNaN(interval) || interval < 60)
      e.dutchInterval = "Drop interval must be at least 60 seconds.";
  }

  return e;
}

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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((p) => {
      const next: FormState = { ...p, [k]: v };
      if (k === "type") {
        if (v === "DUTCH") {
          next.minIncrement = "";
          next.buyNowPrice = "";
          next.antiSnipingMins = "";
          next.endTime = "";
        } else {
          next.dutchPriceStep = "";
          next.dutchInterval = "";
          if (!next.minIncrement) next.minIncrement = "100";
          if (!next.antiSnipingMins) next.antiSnipingMins = "5";
        }
      }
      return next;
    });
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError("");
    const fieldErrors = validate(form);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const toISO = (v: string) => (v ? new Date(v).toISOString() : undefined);
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
      } else {
        body.dutchPriceStep = parseFloat(form.dutchPriceStep);
        body.dutchInterval = parseInt(form.dutchInterval);
      }
      const res = await api.post("/auctions", body);
      router.push(`/auctions/${res.data.id}`);
    } catch (err: unknown) {
      const e = err as {
        response?: {
          data?: { message?: string; errors?: Record<string, string> };
        };
      };
      const data = e.response?.data;
      if (data?.errors && typeof data.errors === "object") {
        setErrors(data.errors as FieldErrors);
        setGlobalError(data.message || "Please fix the errors below.");
      } else {
        setGlobalError(parseApiError(err, "Couldn’t create the auction."));
      }
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <PageShell maxWidth={840}>
      <PageHeader
        eyebrow="New listing"
        title="Create auction"
        subtitle="English, Dutch, or sealed-bid — pick a type and the form adapts."
      />

      <Card padding="lg">
        {(globalError || hasErrors) && (
          <Alert tone="error" style={{ marginBottom: "1rem" }}>
            {globalError || "Please fix the highlighted fields below."}
          </Alert>
        )}

        <form
          onSubmit={onSubmit}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}
        >
          <Field label="Title *" error={errors.title}>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Vintage Rolex Submariner"
              invalid={!!errors.title}
            />
          </Field>

          <Field
            label="Description"
            hint="Min 10 characters if provided"
            error={errors.description}
          >
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Condition, history, dimensions…"
              invalid={!!errors.description}
            />
          </Field>

          <Field label="Auction type">
            <Select
              value={form.type}
              onChange={(e) =>
                set(
                  "type",
                  e.target.value as "ENGLISH" | "DUTCH" | "SEALED_BID"
                )
              }
            >
              <option value="ENGLISH">English — ascending bids</option>
              <option value="DUTCH">Dutch — price drops over time</option>
              <option value="SEALED_BID">Sealed bid — blind, highest wins</option>
            </Select>
          </Field>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <Field label="Starting price (₹) *" error={errors.startingPrice}>
              <Input
                type="number"
                min="1"
                value={form.startingPrice}
                onChange={(e) => set("startingPrice", e.target.value)}
                placeholder="e.g. 5000"
                invalid={!!errors.startingPrice}
              />
            </Field>
            <Field
              label="Reserve price (₹)"
              hint="Optional minimum to sell"
              error={errors.reservePrice}
            >
              <Input
                type="number"
                min="0"
                value={form.reservePrice}
                onChange={(e) => set("reservePrice", e.target.value)}
                placeholder="e.g. 8000"
                invalid={!!errors.reservePrice}
              />
            </Field>
          </div>

          {form.type !== "DUTCH" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <Field label="Min bid increment (₹) *" error={errors.minIncrement}>
                <Input
                  type="number"
                  min="1"
                  value={form.minIncrement}
                  onChange={(e) => set("minIncrement", e.target.value)}
                  placeholder="e.g. 100"
                  invalid={!!errors.minIncrement}
                />
              </Field>
              <Field
                label="Buy-now price (₹)"
                hint="Optional instant-buy"
                error={errors.buyNowPrice}
              >
                <Input
                  type="number"
                  min="1"
                  value={form.buyNowPrice}
                  onChange={(e) => set("buyNowPrice", e.target.value)}
                  placeholder="e.g. 15000"
                  invalid={!!errors.buyNowPrice}
                />
              </Field>
            </div>
          )}

          {form.type === "DUTCH" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                }}
              >
                <Field
                  label="Price drop step (₹) *"
                  error={errors.dutchPriceStep}
                >
                  <Input
                    type="number"
                    min="1"
                    value={form.dutchPriceStep}
                    onChange={(e) => set("dutchPriceStep", e.target.value)}
                    placeholder="e.g. 200"
                    invalid={!!errors.dutchPriceStep}
                  />
                </Field>
                <Field
                  label="Drop interval (seconds) *"
                  hint="Min 60 s"
                  error={errors.dutchInterval}
                >
                  <Input
                    type="number"
                    min="60"
                    value={form.dutchInterval}
                    onChange={(e) => set("dutchInterval", e.target.value)}
                    placeholder="e.g. 300"
                    invalid={!!errors.dutchInterval}
                  />
                </Field>
              </div>
              <DutchDurationHint form={form} />
            </>
          )}

          {form.type !== "DUTCH" && (
            <Field
              label="Anti-sniping window (minutes)"
              hint="Extends auction if bid placed near end (0–30)"
            >
              <Input
                type="number"
                min="0"
                max="30"
                value={form.antiSnipingMins}
                onChange={(e) => set("antiSnipingMins", e.target.value)}
              />
            </Field>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <Field
              label="Start time"
              hint="Leave blank to start immediately"
              error={errors.startTime}
            >
              <Input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                invalid={!!errors.startTime}
              />
            </Field>
            {form.type !== "DUTCH" && (
              <Field label="End time *" error={errors.endTime}>
                <Input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                  invalid={!!errors.endTime}
                />
              </Field>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={loading}
            style={{ marginTop: "0.5rem" }}
          >
            {loading ? "Creating auction…" : "Create auction"}
          </Button>
        </form>
      </Card>
    </PageShell>
  );
}

function DutchDurationHint({ form }: { form: FormState }) {
  const start = parseFloat(form.startingPrice);
  const step = parseFloat(form.dutchPriceStep);
  const interval = parseInt(form.dutchInterval);
  const floor = parseFloat(form.reservePrice) || 0;
  if (
    !form.startingPrice ||
    !form.dutchPriceStep ||
    !form.dutchInterval ||
    isNaN(start) ||
    isNaN(step) ||
    isNaN(interval) ||
    step <= 0 ||
    interval <= 0
  ) {
    return null;
  }
  const drops = Math.ceil((start - floor) / step);
  const totalSecs = drops * interval;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const durText =
    h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return (
    <Alert tone="info">
      Auction will last approximately <strong>{durText}</strong> ({drops} drops ×{" "}
      {interval}s) — end time is auto-computed.
    </Alert>
  );
}
