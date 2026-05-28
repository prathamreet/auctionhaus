/**
 * Phase A1 — money helpers.
 *
 * The money columns in the schema are NUMERIC(18,2). Prisma maps that to a
 * `Prisma.Decimal` instance (alias of decimal.js) on read, and accepts
 * `Decimal | number | string` on write.
 *
 * In this codebase:
 *   - Controllers parse user input via `z.number()`. They pass a plain JS
 *     `number` to services.
 *   - Services convert that to a Decimal at the boundary (`D(amount)`) and do
 *     every comparison / arithmetic through Decimal methods. JS operators
 *     `+ - < >` on Decimal are NOT meaningful -- use `.add() .sub() .lt() .gt() .cmp()`.
 *   - Before returning from a service to a controller (or emitting to a
 *     socket), every Decimal field gets converted back to `number` via
 *     `serializeMoney()` so the API surface stays number-typed and the
 *     frontend `amount: number` types keep working. JS `number` represents
 *     all 2-decimal values up to ~9 x 10^13 exactly, so display precision
 *     is preserved.
 *
 * Helpers exported:
 *   - D(x): construct a Decimal from number | string | Decimal | null.
 *   - toNum(x): convert a Decimal (or numeric) to a plain JS number. Null in,
 *               null out so optional fields propagate.
 *   - neg(x): D(x).neg() shortcut for transaction logs that store -amount.
 *   - serializeMoney(obj): recursively walk an object/array and convert
 *               every Decimal-like field to a number. Used at the API edge.
 */

import { Prisma } from '@prisma/client';

export type DecimalInput = Prisma.Decimal | number | string;

export const D = (x: DecimalInput): Prisma.Decimal => {
  if (x instanceof Prisma.Decimal) return x;
  return new Prisma.Decimal(x);
};

export const toNum = (x: Prisma.Decimal | number | string | null | undefined): number | null => {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') return Number(x);
  return x.toNumber();
};

export const neg = (x: DecimalInput): Prisma.Decimal => D(x).neg();

/**
 * Detect a Prisma.Decimal without an instanceof check that would fail across
 * re-bundled copies of the package. Prisma decorates each instance with a
 * marker symbol; falling back to a duck-type check on `toNumber` covers any
 * runtime that exposes the right surface.
 */
const isDecimalLike = (v: unknown): v is Prisma.Decimal => {
  if (v === null || typeof v !== 'object') return false;
  if (v instanceof Prisma.Decimal) return true;
  const o = v as { s?: unknown; e?: unknown; d?: unknown; toNumber?: unknown };
  return typeof o.toNumber === 'function' && Array.isArray(o.d) && typeof o.e === 'number';
};

/**
 * Walk an arbitrary structure and convert every Prisma.Decimal leaf to a JS
 * number. Returns a new object (does not mutate the input). Dates and other
 * non-plain objects are passed through untouched.
 *
 * Used at the controller / socket-emit boundary so callers (REST clients,
 * websocket subscribers, the frontend) receive `amount: 120` instead of
 * `amount: { s: 1, e: 2, d: [120] }` or `amount: "120"`.
 */
export const serializeMoney = <T>(value: T): T => {
  if (value === null || value === undefined) return value;
  if (isDecimalLike(value)) {
    return value.toNumber() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeMoney(v)) as unknown as T;
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeMoney(v);
    }
    return out as unknown as T;
  }
  return value;
};
