"use client";
import { useCallback, useState } from "react";
import type { z } from "zod";
import { zodIssuesToErrors } from "@/lib/contracts";

/**
 * Light controlled-form hook with Zod validation.
 * No react-hook-form dependency — we own the state and re-render cost is
 * fine for the form sizes here (max ~12 fields).
 *
 * Internally the form values are held as a plain `Record<string, unknown>`
 * so spreads and index access stay well-typed regardless of how the installed
 * Zod version represents a schema's input type (v3 and v4 differ in their
 * generic internals). Zod types are only used at the boundaries: `initial`
 * (call-site checked against the schema input) and the parsed output handed
 * to `onSubmit` / `validate`.
 *
 * Usage:
 *   const form = useZodForm(loginSchema, { email: "", password: "" });
 *   <input {...form.register("email")} />
 *   <form onSubmit={form.onSubmit(async (data) => { ... })}>
 */
export function useZodForm<S extends z.ZodTypeAny>(
  schema: S,
  initial: z.input<S>
) {
  type Output = z.output<S>;
  type Values = Record<string, unknown>;

  const [values, setValues] = useState<Values>(initial as unknown as Values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((p) => ({ ...p, [name]: value }));
    setErrors((p) => (p[name] ? { ...p, [name]: "" } : p));
  }, []);

  const setAllValues = useCallback(
    (updater: (prev: Values) => Values) => {
      setValues((p) => updater(p));
    },
    []
  );

  const register = useCallback(
    (name: string) => ({
      name,
      value: (values[name] ?? "") as string | number,
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => {
        const target = e.target;
        let next: unknown;
        if (target instanceof HTMLInputElement && target.type === "number") {
          next = target.value === "" ? "" : Number(target.value);
        } else {
          next = target.value;
        }
        setValue(name, next);
      },
      invalid: !!errors[name],
    }),
    [values, errors, setValue]
  );

  const validate = useCallback((): Output | null => {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      setErrors({});
      return parsed.data as Output;
    }
    setErrors(zodIssuesToErrors(parsed.error));
    return null;
  }, [schema, values]);

  const onSubmit = useCallback(
    (handler: (data: Output) => void | Promise<void>) =>
      async (e: React.FormEvent) => {
        e.preventDefault();
        setGlobalError(null);
        const parsed = schema.safeParse(values);
        if (!parsed.success) {
          setErrors(zodIssuesToErrors(parsed.error));
          return;
        }
        setErrors({});
        setSubmitting(true);
        try {
          await handler(parsed.data as Output);
        } catch (err: unknown) {
          const apiErr = err as {
            response?: {
              data?: { message?: string; errors?: Record<string, string> };
            };
            message?: string;
          };
          if (apiErr.response?.data?.errors) {
            setErrors(apiErr.response.data.errors);
          }
          setGlobalError(
            apiErr.response?.data?.message ?? apiErr.message ?? "Something went wrong"
          );
        } finally {
          setSubmitting(false);
        }
      },
    [schema, values]
  );

  const setServerErrors = useCallback((errs: Record<string, string>) => {
    setErrors(errs);
  }, []);

  const reset = useCallback(
    (next?: Values) => {
      setValues({ ...(initial as unknown as Values), ...(next ?? {}) });
      setErrors({});
      setGlobalError(null);
    },
    [initial]
  );

  return {
    values,
    errors,
    globalError,
    submitting,
    setValue,
    setAllValues,
    setServerErrors,
    setGlobalError,
    register,
    validate,
    onSubmit,
    reset,
  };
}
