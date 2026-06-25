import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Role, Tier } from "./types";

const ROLES: Role[] = ["user", "admin"];
const TIERS: Tier[] = ["free", "paid"];

export interface UserPatch {
  id: string;
  role?: Role;
  tier?: Tier;
}

/** 회원 수정 입력 검증: id 필수 + role/tier 중 하나 이상, 허용 값만. */
export function parseUserPatch(input: Record<string, unknown>): UserPatch {
  const id = input.id;
  if (typeof id !== "string" || !id) throw new Error("id가 필요합니다.");

  const patch: UserPatch = { id };
  if (input.role !== undefined) {
    if (!ROLES.includes(input.role as Role))
      throw new Error("role 값이 올바르지 않습니다.");
    patch.role = input.role as Role;
  }
  if (input.tier !== undefined) {
    if (!TIERS.includes(input.tier as Tier))
      throw new Error("tier 값이 올바르지 않습니다.");
    patch.tier = input.tier as Tier;
  }
  if (patch.role === undefined && patch.tier === undefined)
    throw new Error("변경할 값(role 또는 tier)이 필요합니다.");
  return patch;
}

export interface PolicyPatch {
  policy_key: string;
  name?: string;
  points?: number;
  is_active?: boolean;
}

/** 포인트 정책 수정 입력 검증: policy_key 필수 + name/points/is_active 중 하나 이상. */
export function parsePolicyPatch(input: Record<string, unknown>): PolicyPatch {
  const key = input.policy_key;
  if (typeof key !== "string" || !key)
    throw new Error("policy_key가 필요합니다.");

  const patch: PolicyPatch = { policy_key: key };
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim())
      throw new Error("name 값이 올바르지 않습니다.");
    patch.name = input.name.trim();
  }
  if (input.points !== undefined) {
    const p = input.points;
    if (typeof p !== "number" || !Number.isInteger(p) || p < 0)
      throw new Error("points는 0 이상의 정수여야 합니다.");
    patch.points = p;
  }
  if (input.is_active !== undefined) {
    if (typeof input.is_active !== "boolean")
      throw new Error("is_active는 boolean이어야 합니다.");
    patch.is_active = input.is_active;
  }
  if (
    patch.name === undefined &&
    patch.points === undefined &&
    patch.is_active === undefined
  )
    throw new Error("변경할 값이 필요합니다.");
  return patch;
}

/** 요청자가 admin인지 확인. 아니면 throw. (서버 세션 클라이언트 사용) */
export async function assertAdminRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverDb: SupabaseClient | any
): Promise<Profile> {
  const {
    data: { user },
  } = await serverDb.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const { data } = await serverDb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || data.role !== "admin") throw new Error("forbidden");
  return data as Profile;
}
