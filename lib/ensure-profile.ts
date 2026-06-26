import "server-only";
import { createAdminSupabase } from "./supabase/admin";
import type { Profile } from "./types";

interface MinimalUser {
  id: string;
  email?: string | null;
  user_metadata?: { name?: string } | null;
}

function genReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function ensureReferralCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string
) {
  const { data } = await admin
    .from("referral_codes")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await admin
      .from("referral_codes")
      .insert({ user_id: userId, code: genReferralCode() });
  }
}

/**
 * profiles 행이 없으면 생성한다(가입 트리거 미설치/트리거 이전 가입자 대비).
 * referral_codes 도 함께 보장한다. service_role 키가 없으면 null.
 *
 * 트리거가 정상 동작하면 이 경로는 거의 타지 않는다(방어적 보강).
 */
export async function ensureProfile(
  user: MinimalUser
): Promise<Profile | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    await ensureReferralCode(admin, user.id);
    return existing as Profile;
  }

  const { data: created, error } = await admin
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? null,
      display_name:
        user.user_metadata?.name ?? user.email?.split("@")[0] ?? null,
    })
    .select()
    .single();

  if (error || !created) return null;
  await ensureReferralCode(admin, user.id);
  return created as Profile;
}
