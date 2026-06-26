import { expect, test } from "vitest";
import { canReserve } from "./consultation";
import type { Profile } from "./types";

test("canReserve requires phone verified", () => {
  expect(
    canReserve({ phone_verified_at: "2026-06-26T00:00:00Z" } as Profile)
  ).toBe(true);
  expect(canReserve({ phone_verified_at: null } as Profile)).toBe(false);
  expect(canReserve(null)).toBe(false);
});
