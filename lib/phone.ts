/** 휴대폰 인증 코어 로직 (PRD 9.8) — 6자리 코드, 5분 만료. */

const EXPIRY_MS = 5 * 60 * 1000;

/** 6자리 인증번호 생성 */
export function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 발급 시각 기준 만료 시각(+5분) */
export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + EXPIRY_MS);
}

export interface VerifyRecord {
  code: string;
  expires_at: string;
  verified_at: string | null;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "mismatch" | "used" };

/** 입력 코드 검증: 이미 사용됨 / 만료 / 불일치 / 성공 */
export function verifyCode(
  record: VerifyRecord,
  input: string,
  now: Date
): VerifyResult {
  if (record.verified_at) return { ok: false, reason: "used" };
  if (now.getTime() > new Date(record.expires_at).getTime())
    return { ok: false, reason: "expired" };
  if (record.code !== input) return { ok: false, reason: "mismatch" };
  return { ok: true };
}
