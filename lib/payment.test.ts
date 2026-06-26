import { expect, test } from "vitest";
import { runDemoPayment, DEMO_AMOUNT } from "./payment";

function makeDb() {
  const store: Record<string, Record<string, unknown>[]> = {
    payments: [],
    profiles: [{ id: "u1", tier: "free" }],
    consultations: [{ id: "c1", user_id: "u1", status: "started" }],
    point_policies: [
      { policy_key: "payment_completed", name: "결제완료 보상", points: 5000, is_active: true },
    ],
    point_events: [],
  };
  const updates: { table: string; fields: Record<string, unknown> }[] = [];

  class QB {
    filters: [string, unknown][] = [];
    constructor(private table: string) {}
    select() {
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push([c, v]);
      return this;
    }
    private match() {
      return store[this.table].filter((r) =>
        this.filters.every(([c, v]) => r[c] === v)
      );
    }
    async maybeSingle() {
      return { data: this.match()[0] ?? null, error: null };
    }
    async single() {
      return { data: this.match()[0] ?? null, error: null };
    }
    update(fields: Record<string, unknown>) {
      this.filters = [];
      return {
        eq: (c: string, v: unknown) => {
          store[this.table]
            .filter((r) => r[c] === v)
            .forEach((r) => Object.assign(r, fields));
          updates.push({ table: this.table, fields });
          return Promise.resolve({ error: null });
        },
      };
    }
    insert(row: Record<string, unknown>) {
      const inserted = { id: `${this.table}_${store[this.table].length}`, ...row };
      store[this.table].push(inserted);
      const thenable = {
        then: (res: (v: unknown) => void) => res({ data: [inserted], error: null }),
        select: () => ({ single: async () => ({ data: inserted, error: null }) }),
      };
      return thenable;
    }
  }
  return { db: { from: (t: string) => new QB(t) }, store, updates };
}

test("runDemoPayment records payment, upgrades tier, resumes consultation, grants points", async () => {
  const { db, store } = makeDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await runDemoPayment(db as any, {
    userId: "u1",
    consultationId: "c1",
  });

  expect(result.tier).toBe("paid");
  expect(store.payments).toHaveLength(1);
  expect(store.payments[0]).toMatchObject({
    status: "paid",
    payment_provider: "demo",
    amount: DEMO_AMOUNT,
  });
  expect(store.profiles[0].tier).toBe("paid");
  expect(store.consultations[0].status).toBe("resumed");
  expect(store.point_events).toHaveLength(1);
  expect(store.point_events[0].policy_key).toBe("payment_completed");
});
