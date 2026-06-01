/**
 * Phase A1 — test helpers for asserting against `Prisma.Decimal` values.
 *
 * After A1 the services pass `Prisma.Decimal` instances to Prisma (for fields
 * like `bid.amount`, `wallet.balance.increment`, transaction logs). Jest's
 * `toEqual` / `objectContaining` use structural equality, so a literal
 * `{ amount: 500 }` no longer matches `{ amount: Decimal(500) }` even though
 * the values are equal.
 *
 * Use `m(500)` (alias `eqMoney`) inside any `expect.objectContaining({...})`
 * to match either form. Examples:
 *
 *     expect(prismaMock.bid.create).toHaveBeenCalledWith({
 *       data: expect.objectContaining({ amount: m(120) }),
 *     });
 *
 *     expect(prismaMock.transaction.createMany).toHaveBeenCalledWith({
 *       data: expect.arrayContaining([
 *         expect.objectContaining({ amount: m(-500) }),
 *       ]),
 *     });
 *
 * The matcher accepts the field as `number | string | Decimal | { increment | decrement }`.
 * For wallet `{ balance: { increment: X } }` operands, wrap the inner value:
 *
 *     data: { balance: { increment: m(120) } }
 *
 * Returns a Jest asymmetric matcher object.
 */

interface AsymmetricMatcher {
  asymmetricMatch(other: unknown): boolean;
  toAsymmetricMatcher(): string;
}

const toNumberLoose = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof v === 'object') {
    const o = v as { toNumber?: () => number };
    if (typeof o.toNumber === 'function') return o.toNumber();
  }
  return null;
};

export const m = (expected: number): AsymmetricMatcher => ({
  asymmetricMatch(other: unknown): boolean {
    const n = toNumberLoose(other);
    if (n === null) return false;
    return n === expected;
  },
  toAsymmetricMatcher(): string {
    return `m(${expected})`;
  },
});

export const eqMoney = m;
