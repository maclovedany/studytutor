import { expect, test } from "vitest";
import { runAfterSignup } from "./after-signup";

// ── 인메모리 Supabase 페이크 ──────────────────────────────────────────────
class QB {
  filters: [string, unknown][] = [];
  constructor(
    private store: Record<string, Record<string, unknown>[]>,
    private table: string
  ) {}
  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  limit() {
    return this;
  }
  private match() {
    return this.store[this.table].filter((r) =>
      this.filters.every(([c, v]) => r[c] === v)
    );
  }
  async maybeSingle() {
    return { data: this.match()[0] ?? null, error: null };
  }
  async single() {
    return { data: this.match()[0] ?? null, error: null };
  }
  insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
    const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    if (this.table === "referrals") {
      for (const r of rows) {
        if (
          this.store.referrals.some((x) => x.referred_id === r.referred_id)
        ) {
          return makeThenable({ data: null, error: { message: "duplicate" } });
        }
      }
    }
    const inserted = rows.map((r, i) => ({
      id: `${this.table}_${this.store[this.table].length + i}`,
      ...r,
    }));
    this.store[this.table].push(...inserted);
    const thenable = makeThenable({ data: inserted, error: null });
    thenable.select = () => ({ single: async () => ({ data: inserted[0], error: null }) });
    return thenable;
  }
}

function makeThenable(result: unknown) {
  return {
    then: (resolve: (r: unknown) => void) => resolve(result),
  } as { then: (r: (v: unknown) => void) => void; select?: () => unknown };
}

function makeDb({
  existingSignup = false,
  refOwner = null as string | null,
  userId = "u1",
} = {}) {
  const store: Record<string, Record<string, unknown>[]> = {
    point_events: existingSignup
      ? [{ id: "seed", user_id: userId, policy_key: "signup", points: 1000 }]
      : [],
    point_policies: [
      { policy_key: "signup", name: "신규가입", points: 1000, is_active: true },
      { policy_key: "referral_join", name: "추천 가입자 보상", points: 2000, is_active: true },
      { policy_key: "referral_inviter", name: "추천인 보상", points: 3000, is_active: true },
    ],
    referral_codes: refOwner
      ? [{ code: "ABC123", user_id: refOwner, is_active: true }]
      : [],
    referrals: [],
    message_jobs: [],
  };
  const db = { from: (t: string) => new QB(store, t) };
  return { db, store };
}

// ── 테스트 ────────────────────────────────────────────────────────────────
test("grants signup + schedules 1 immediate message, no ref", async () => {
  const { db, store } = makeDb({ existingSignup: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await runAfterSignup(db as any, { userId: "u1" });
  expect(r.granted).toContain("signup");
  expect(r.messages).toBe(1);
  expect(r.referred).toBe(false);
  expect(store.message_jobs).toHaveLength(1);
  expect(store.message_jobs[0]).toMatchObject({
    template_key: "signup_done",
    channel: "kakao",
    status: "pending",
  });
});

test("idempotent when signup already granted", async () => {
  const { db } = makeDb({ existingSignup: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await runAfterSignup(db as any, { userId: "u1" });
  expect(r.granted).toHaveLength(0);
  expect(r.messages).toBe(0);
});

test("valid refCode grants join+inviter and records referral", async () => {
  const { db, store } = makeDb({ existingSignup: false, refOwner: "inviter1" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await runAfterSignup(db as any, { userId: "u2", refCode: "ABC123" });
  expect(r.referred).toBe(true);
  expect(r.granted).toEqual(
    expect.arrayContaining(["referral_join", "referral_inviter"])
  );
  expect(store.referrals).toHaveLength(1);
});

test("invalid refCode grants no referral points", async () => {
  const { db, store } = makeDb({ existingSignup: false, refOwner: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await runAfterSignup(db as any, { userId: "u3", refCode: "NOPE" });
  expect(r.referred).toBe(false);
  expect(r.granted).not.toContain("referral_join");
  expect(store.referrals).toHaveLength(0);
});

test("self-referral is ignored", async () => {
  const { db, store } = makeDb({ existingSignup: false, refOwner: "u4" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await runAfterSignup(db as any, { userId: "u4", refCode: "ABC123" });
  expect(r.referred).toBe(false);
  expect(store.referrals).toHaveLength(0);
});
