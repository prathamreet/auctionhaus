import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

export const prisma = mockDeep<PrismaClient>();
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);

  // Phase A2 defaults so the interactive-transaction + pessimistic-lock
  // pattern is transparent to existing tests.
  //
  // (1) $queryRaw\`SELECT id ... FOR UPDATE\` -- services check
  //     `result.length === 0` for "row not found". mockDeep's default
  //     `undefined` would crash `.length`; return one row so the lock
  //     acquisition path is invisible. Tests that want to simulate the
  //     not-found branch can override with mockResolvedValueOnce([]).
  (prismaMock.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ id: '_locked_' }]);

  // (2) $transaction must execute its argument so the inner body actually
  //     runs against prismaMock. Supports both shapes:
  //     - interactive: prisma.$transaction(async (tx) => { ... })
  //     - batched:     prisma.$transaction([p1, p2, p3])
  //     Tests can still override per-test if they want different semantics.
  (prismaMock.$transaction as unknown as jest.Mock).mockImplementation(
    (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
      }
      return Promise.resolve(undefined);
    }
  );
});
