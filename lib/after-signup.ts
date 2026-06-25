import type { SupabaseClient } from "@supabase/supabase-js";
import { grantPoints } from "./points";

/** 가입 후 예약할 1/3/7일 메시지 (PRD 9.7) */
const MESSAGE_TEMPLATES = [
  { day: 1, template_key: "welcome_d1", message: "회원가입해주셔서 감사합니다" },
  {
    day: 3,
    template_key: "remind_d3",
    message: "아직 상담을 예약하지 않으셨다면 지금 시작해보세요",
  },
  { day: 7, template_key: "expire_d7", message: "첫 상담 혜택이 곧 종료됩니다" },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

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
 *  - 1/3/7일 메시지 예약 3건 생성
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

  // 1/3/7일 메시지 예약
  const rows = MESSAGE_TEMPLATES.map((t) => ({
    user_id: userId,
    channel: "kakao",
    template_key: t.template_key,
    message: t.message,
    scheduled_at: new Date(now.getTime() + t.day * DAY_MS).toISOString(),
    status: "pending",
  }));
  await db.from("message_jobs").insert(rows);

  return { granted, referred, messages: rows.length };
}
