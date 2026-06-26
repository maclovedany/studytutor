import { expect, test } from "vitest";
import { elapsedSeconds, isFreeExpired, shouldShowPaywall } from "./timer";
import type { Profile } from "./types";

const start = "2026-06-26T00:00:00Z";

test("elapsedSeconds", () => {
  expect(elapsedSeconds(start, new Date("2026-06-26T00:01:00Z"))).toBe(60);
  expect(elapsedSeconds(start, new Date("2026-06-26T00:00:00Z"))).toBe(0);
});

test("free expires at 15 min", () => {
  expect(isFreeExpired(start, new Date("2026-06-26T00:14:59Z"))).toBe(false);
  expect(isFreeExpired(start, new Date("2026-06-26T00:15:00Z"))).toBe(true);
});

test("paywall only for free after 15min", () => {
  const after = new Date("2026-06-26T00:16:00Z");
  const before = new Date("2026-06-26T00:05:00Z");
  expect(shouldShowPaywall({ tier: "free" } as Profile, start, after)).toBe(true);
  expect(shouldShowPaywall({ tier: "paid" } as Profile, start, after)).toBe(false);
  expect(shouldShowPaywall({ tier: "free" } as Profile, start, before)).toBe(false);
});

test("no paywall when not started", () => {
  expect(shouldShowPaywall({ tier: "free" } as Profile, null, new Date())).toBe(
    false
  );
});
