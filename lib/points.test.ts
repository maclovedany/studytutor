import { expect, test } from "vitest";
import { sumPoints, grantPoints } from "./points";

test("sumPoints adds event points", () => {
  expect(sumPoints([{ points: 1000 }, { points: 2000 }, { points: -500 }])).toBe(
    2500
  );
  expect(sumPoints([])).toBe(0);
});

function fakeDb(policy: unknown) {
  const inserted: unknown[] = [];
  return {
    inserted,
    from(table: string) {
      if (table === "point_policies") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: policy }) }),
          }),
        };
      }
      if (table === "point_events") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                inserted.push(row);
                return { data: { id: "x", ...row } };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test("grantPoints inserts when policy active", async () => {
  const db = fakeDb({
    policy_key: "signup",
    points: 1000,
    is_active: true,
    name: "신규가입",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = await grantPoints(db as any, { userId: "u1", policyKey: "signup" });
  expect(ev?.points).toBe(1000);
  expect(db.inserted).toHaveLength(1);
});

test("grantPoints skips when policy inactive", async () => {
  const db = fakeDb({ policy_key: "signup", points: 1000, is_active: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = await grantPoints(db as any, { userId: "u1", policyKey: "signup" });
  expect(ev).toBeNull();
  expect(db.inserted).toHaveLength(0);
});

test("grantPoints skips when policy missing", async () => {
  const db = fakeDb(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = await grantPoints(db as any, { userId: "u1", policyKey: "nope" });
  expect(ev).toBeNull();
});
