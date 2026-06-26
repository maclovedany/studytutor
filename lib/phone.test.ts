import { expect, test } from "vitest";
import { genCode, expiryFrom, verifyCode } from "./phone";

test("genCode is 6 digits", () => {
  for (let i = 0; i < 50; i++) {
    expect(genCode()).toMatch(/^\d{6}$/);
  }
});

test("expiryFrom adds 5 minutes", () => {
  const now = new Date("2026-06-26T00:00:00Z");
  expect(expiryFrom(now).toISOString()).toBe("2026-06-26T00:05:00.000Z");
});

test("verifyCode ok within expiry and matching", () => {
  const now = new Date("2026-06-26T00:01:00Z");
  expect(
    verifyCode(
      { code: "123456", expires_at: "2026-06-26T00:05:00Z", verified_at: null },
      "123456",
      now
    )
  ).toEqual({ ok: true });
});

test("verifyCode expired", () => {
  const now = new Date("2026-06-26T00:06:00Z");
  expect(
    verifyCode(
      { code: "123456", expires_at: "2026-06-26T00:05:00Z", verified_at: null },
      "123456",
      now
    )
  ).toEqual({ ok: false, reason: "expired" });
});

test("verifyCode mismatch", () => {
  const now = new Date("2026-06-26T00:01:00Z");
  expect(
    verifyCode(
      { code: "123456", expires_at: "2026-06-26T00:05:00Z", verified_at: null },
      "000000",
      now
    )
  ).toEqual({ ok: false, reason: "mismatch" });
});

test("verifyCode already used", () => {
  const now = new Date("2026-06-26T00:01:00Z");
  expect(
    verifyCode(
      {
        code: "123456",
        expires_at: "2026-06-26T00:05:00Z",
        verified_at: "2026-06-26T00:00:30Z",
      },
      "123456",
      now
    )
  ).toEqual({ ok: false, reason: "used" });
});
