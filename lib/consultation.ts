import type { Profile } from "./types";

/** MVP 데모용 Zoom 링크 (실제 SDK 임베드는 범위 밖) */
export const DEMO_ZOOM_URL = "https://zoom.us/j/DEMO-COACHRING";

/** 상담예약 가능 여부 — 휴대폰 인증 완료가 필수 (PRD 8.4, 9.9) */
export function canReserve(
  profile: Pick<Profile, "phone_verified_at"> | null
): boolean {
  return !!profile?.phone_verified_at;
}
