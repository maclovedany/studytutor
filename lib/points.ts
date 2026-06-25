import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointEvent } from "./types";

/** 포인트 이벤트 목록의 합계 = 총 포인트. (잔액 컬럼 없음) */
export function sumPoints(events: { points: number }[]): number {
  return events.reduce((total, e) => total + e.points, 0);
}

export interface GrantOptions {
  userId: string;
  policyKey: string;
  relatedUserId?: string | null;
  reason?: string;
}

/**
 * 정책 기반 포인트 지급.
 * point_policies에서 수치를 읽어(하드코딩 금지) is_active일 때만 point_events에 적립한다.
 * 비활성/미존재 정책이면 지급하지 않고 null을 반환한다.
 *
 * db는 service_role 클라이언트(RLS 우회)를 받는다. 테스트에서는 fake를 주입.
 */
export async function grantPoints(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient | any,
  opts: GrantOptions
): Promise<PointEvent | null> {
  const { data: policy } = await db
    .from("point_policies")
    .select("*")
    .eq("policy_key", opts.policyKey)
    .maybeSingle();

  if (!policy || !policy.is_active) return null;

  const row = {
    user_id: opts.userId,
    policy_key: opts.policyKey,
    points: policy.points,
    reason: opts.reason ?? policy.name,
    related_user_id: opts.relatedUserId ?? null,
  };

  const { data } = await db
    .from("point_events")
    .insert(row)
    .select()
    .single();

  return (data as PointEvent) ?? null;
}
