import type { SupabaseClient } from "@supabase/supabase-js";
import { grantPoints } from "./points";
import { MESSAGE_TEMPLATES, buildJobRow } from "./messages";

/** 데모 결제 금액 (원) */
export const DEMO_AMOUNT = 9900;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DemoPaymentOptions {
  userId: string;
  consultationId: string;
  now?: Date;
}

export interface DemoPaymentResult {
  tier: "paid";
}

/**
 * 데모 결제 처리 (PRD 9.11). service_role 클라이언트로 호출.
 *  - payments 기록 (provider=demo, status=paid)
 *  - profiles.tier = paid
 *  - consultations.status = resumed, paid_at 기록
 *  - 결제완료 포인트 지급
 *
 * 실제 결제 연동 시 이 함수를 결제사 승인 검증 + 내역 저장으로 교체한다.
 */
export async function runDemoPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient | any,
  { userId, consultationId, now = new Date() }: DemoPaymentOptions
): Promise<DemoPaymentResult> {
  const paidAt = now.toISOString();

  await db.from("payments").insert({
    user_id: userId,
    consultation_id: consultationId,
    amount: DEMO_AMOUNT,
    status: "paid",
    payment_provider: "demo",
    paid_at: paidAt,
  });

  await db.from("profiles").update({ tier: "paid" }).eq("id", userId);

  await db
    .from("consultations")
    .update({ status: "resumed", paid_at: paidAt })
    .eq("id", consultationId);

  await grantPoints(db, { userId, policyKey: "payment_completed" });

  // 결제 즉시 감사 + 1일 후 사용 점검 메시지 예약
  await db.from("message_jobs").insert([
    buildJobRow(userId, MESSAGE_TEMPLATES.purchase_thanks, now),
    buildJobRow(userId, MESSAGE_TEMPLATES.usage_checkin_d1, new Date(now.getTime() + DAY_MS)),
  ]);

  return { tier: "paid" };
}
