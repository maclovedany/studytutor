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
    message_jobs: [],
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
    insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const inserted = rows.map((r, i) => ({
        id: `${this.table}_${store[this.table].length + i}`,
        ...r,
      }));
      store[this.table].push(...inserted);
      const thenable = {
        then: (res: (v: unknown) => void) => res({ data: inserted, error: null }),
        select: () => ({ single: async () => ({ data: inserted[0], error: null }) }),
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

test("runDemoPayment 은 결제 즉시 감사 + 1일후 점검 메시지를 예약한다", async () => {
  const { db, store } = makeDb();
  const now = new Date("2026-07-09T00:00:00.000Z");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await runDemoPayment(db as any, { userId: "u1", consultationId: "c1", now });

  expect(store.message_jobs).toHaveLength(2);
  const byKey = Object.fromEntries(
    store.message_jobs.map((j) => [j.template_key, j])
  );
  expect(byKey.purchase_thanks.scheduled_at).toBe("2026-07-09T00:00:00.000Z");
  expect(byKey.usage_checkin_d1.scheduled_at).toBe("2026-07-10T00:00:00.000Z");
  expect(byKey.purchase_thanks.status).toBe("pending");
});
