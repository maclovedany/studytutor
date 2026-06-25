import { expect, test } from "vitest";
import { isAdmin, canAccessAdmin } from "./auth";
import type { Profile } from "./types";

const admin = { role: "admin" } as Profile;
const user = { role: "user" } as Profile;

test("isAdmin true only for admin role", () => {
  expect(isAdmin(admin)).toBe(true);
  expect(isAdmin(user)).toBe(false);
  expect(isAdmin(null)).toBe(false);
});

test("canAccessAdmin matches isAdmin", () => {
  expect(canAccessAdmin(admin)).toBe(true);
  expect(canAccessAdmin(user)).toBe(false);
  expect(canAccessAdmin(null)).toBe(false);
});
