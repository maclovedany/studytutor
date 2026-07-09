import type { SupabaseClient } from "@supabase/supabase-js";
import { grantPoints } from "./points";
import { MESSAGE_TEMPLATES, buildJobRow } from "./messages";

export interface AfterSignupOptions {
  userId: string;
  refCode?: string | null;
  now?: Date;
}

export interface AfterSignupResult {
  granted: string[];
  referred: boolean;
  messages: number;
}

/**
 * 가입 후처리(멱등). service_role 클라이언트로 호출한다.
 *  - 이미 signup 포인트가 지급됐으면 전체 no-op
 *  - 신규가입 포인트 지급
 *  - 유효한 추천코드면 referrals 기록 + 가입자/추천인 포인트 지급(중복 referred_id는 skip)
 *  - 가입 즉시 발송 메시지(signup_done) 1건 예약
 */
export async function runAfterSignup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient | any,
  { userId, refCode = null, now = new Date() }: AfterSignupOptions
): Promise<AfterSignupResult> {
  const granted: string[] = [];
  let referred = false;

  // 멱등성: 이미 signup 이벤트가 있으면 아무것도 하지 않는다.
  const { data: existing } = await db
    .from("point_events")
    .select("id")
    .eq("user_id", userId)
    .eq("policy_key", "signup")
    .maybeSingle();
  if (existing) return { granted, referred, messages: 0 };

  // 신규가입 포인트
  const signupEvent = await grantPoints(db, { userId, policyKey: "signup" });
  if (signupEvent) granted.push("signup");

  // 추천 처리
  if (refCode) {
    const { data: codeRow } = await db
      .from("referral_codes")
      .select("user_id")
      .eq("code", refCode)
      .eq("is_active", true)
      .maybeSingle();

    const referrerId: string | undefined = codeRow?.user_id;
    if (referrerId && referrerId !== userId) {
      const { error: refError } = await db.from("referrals").insert({
        referrer_id: referrerId,
        referred_id: userId,
        referral_code: refCode,
      });
      // referred_id UNIQUE 위반(이미 추천받음) → 보상 skip
      if (!refError) {
        referred = true;
        const joinEvent = await grantPoints(db, {
          userId,
          policyKey: "referral_join",
          relatedUserId: referrerId,
        });
        if (joinEvent) granted.push("referral_join");

        const inviterEvent = await grantPoints(db, {
          userId: referrerId,
          policyKey: "referral_inviter",
          relatedUserId: userId,
        });
        if (inviterEvent) granted.push("referral_inviter");
      }
    }
  }

  // 가입 즉시 발송 메시지 1건 예약
  await db
    .from("message_jobs")
    .insert(buildJobRow(userId, MESSAGE_TEMPLATES.signup_done, now));

  return { granted, referred, messages: 1 };
}
