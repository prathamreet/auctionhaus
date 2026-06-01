"use client";
import { useCallback, useState } from "react";
import type { z } from "zod";
import { zodIssuesToErrors } from "@/lib/contracts";

/**
 * Light controlled-form hook with Zod validation.
 * No react-hook-form dependency — we own the state and re-render cost is
 * fine for the form sizes here (max ~12 fields).
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
  type Values = z.input<S>;
  type Output = z.output<S>;

  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const setValue = useCallback(
    <K extends keyof Values>(name: K, value: Values[K]) => {
      setValues((p) => ({ ...p, [name]: value }));
      setErrors((p) => (p[name as string] ? { ...p, [name as string]: "" } : p));
    },
    []
  );

  const setAllValues = useCallback(
    (updater: (prev: Values) => Values) => {
      setValues((p) => updater(p));
    },
    []
  );

  const register = useCallback(
    (name: keyof Values) => ({
      name: name as string,
      value: ((values[name] ?? "") as unknown) as string | number,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
      ) => {
        const target = e.target;
        let next: unknown;
        if (target instanceof HTMLInputElement && target.type === "number") {
          next = target.value === "" ? "" : Number(target.value);
        } else {
          next = target.value;
        }
        setValue(name, next as Values[typeof name]);
      },
      invalid: !!errors[name as string],
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
          const e = err as {
            response?: { data?: { message?: string; errors?: Record<string, string> } };
            message?: string;
          };
          if (e.response?.data?.errors) {
            setErrors(e.response.data.errors);
          }
          setGlobalError(
            e.response?.data?.message ?? e.message ?? "Something went wrong"
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
    (next?: Partial<Values>) => {
      setValues({ ...initial, ...(next ?? {}) } as Values);
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
