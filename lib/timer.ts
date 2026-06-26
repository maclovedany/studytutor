import type { Profile } from "./types";

/** 무료 상담 제한 시간 (초) — 15분 */
export const FREE_LIMIT_SECONDS = 15 * 60;

/** 상담 시작 시각 기준 경과 초 */
export function elapsedSeconds(startedAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);
}

/** 15분(무료 한도) 경과 여부 */
export function isFreeExpired(startedAt: string, now: Date): boolean {
  return elapsedSeconds(startedAt, now) >= FREE_LIMIT_SECONDS;
}

/**
 * 결제 유도 모달 표시 여부.
 * 상담이 시작됐고(startedAt 존재), 무료회원이며, 15분이 지났을 때만 true.
 * 유료회원은 항상 false.
 */
export function shouldShowPaywall(
  profile: Pick<Profile, "tier">,
  startedAt: string | null,
  now: Date
): boolean {
  if (!startedAt) return false;
  if (profile.tier === "paid") return false;
  return isFreeExpired(startedAt, now);
}
