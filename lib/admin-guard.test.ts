import { expect, test } from "vitest";
import { parseUserPatch, parsePolicyPatch } from "./admin-guard";

test("parseUserPatch accepts valid role/tier", () => {
  expect(parseUserPatch({ id: "u1", role: "admin" })).toEqual({
    id: "u1",
    role: "admin",
  });
  expect(parseUserPatch({ id: "u1", tier: "paid" })).toEqual({
    id: "u1",
    tier: "paid",
  });
  expect(parseUserPatch({ id: "u1", role: "user", tier: "free" })).toEqual({
    id: "u1",
    role: "user",
    tier: "free",
  });
});

test("parseUserPatch rejects invalid values", () => {
  expect(() => parseUserPatch({ id: "u1", role: "super" })).toThrow();
  expect(() => parseUserPatch({ id: "u1", tier: "vip" })).toThrow();
  expect(() => parseUserPatch({ role: "admin" })).toThrow(); // id 없음
  expect(() => parseUserPatch({ id: "u1" })).toThrow(); // 바꿀 값 없음
});

test("parsePolicyPatch accepts valid fields", () => {
  expect(
    parsePolicyPatch({ policy_key: "signup", points: 1500, is_active: false })
  ).toEqual({ policy_key: "signup", points: 1500, is_active: false });
  expect(parsePolicyPatch({ policy_key: "signup", name: "가입보상" })).toEqual({
    policy_key: "signup",
    name: "가입보상",
  });
});

test("parsePolicyPatch rejects invalid", () => {
  expect(() => parsePolicyPatch({ points: 100 })).toThrow(); // policy_key 없음
  expect(() => parsePolicyPatch({ policy_key: "signup", points: -5 })).toThrow();
  expect(() =>
    parsePolicyPatch({ policy_key: "signup", points: 1.5 })
  ).toThrow();
  expect(() => parsePolicyPatch({ policy_key: "signup" })).toThrow(); // 바꿀 값 없음
});
