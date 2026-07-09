import "server-only";
import { createHmac } from "node:crypto";

/**
 * Zoom 연동 (서버 전용).
 *  - S2S OAuth 로 상담용 미팅을 생성하고, Meeting SDK 입장 서명(JWT)을 발급한다.
 *  - env 미설정 시 호출부가 데모 링크로 폴백한다(isZoomConfigured 로 판별).
 *  - Client Secret 2종은 절대 클라이언트로 나가지 않는다 — 서명 문자열만 전달.
 */

/** 임베드 실사용 가능 여부: S2S(미팅 생성) + SDK(서명) env 5종이 모두 있어야 한다. */
export function isZoomConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
      process.env.ZOOM_S2S_CLIENT_ID &&
      process.env.ZOOM_S2S_CLIENT_SECRET &&
      process.env.ZOOM_SDK_CLIENT_ID &&
      process.env.ZOOM_SDK_CLIENT_SECRET
  );
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

export interface SdkSignatureOptions {
  meetingNumber: string;
  /** 0=참가자, 1=호스트. 기본 0. */
  role?: number;
  now?: Date;
}

/**
 * Meeting SDK 입장 서명(JWT, HS256). exp 는 iat+2시간(최소 요구 30분 충족).
 * 클레임 요구사항: appKey(=SDK Client ID) 필수(v5+), mn 은 문자열, tokenExp=exp.
 */
export function generateSdkSignature({
  meetingNumber,
  role = 0,
  now = new Date(),
}: SdkSignatureOptions): string {
  const clientId = process.env.ZOOM_SDK_CLIENT_ID!;
  const secret = process.env.ZOOM_SDK_CLIENT_SECRET!;
  const iat = Math.floor(now.getTime() / 1000) - 30; // 시계 오차 여유
  const exp = iat + 60 * 60 * 2;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    appKey: clientId,
    sdkKey: clientId,
    mn: String(meetingNumber),
    role,
    iat,
    exp,
    tokenExp: exp,
  };
  const base = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", secret).update(base).digest("base64url");
  return `${base}.${sig}`;
}

/** Server-to-Server OAuth 액세스 토큰 발급. */
export async function getS2SAccessToken(
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID!;
  const basic = Buffer.from(
    `${process.env.ZOOM_S2S_CLIENT_ID}:${process.env.ZOOM_S2S_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetchFn(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } }
  );
  if (!res.ok) throw new Error(`Zoom 토큰 발급 실패(${res.status})`);
  const data = await res.json();
  return data.access_token as string;
}

export interface ZoomMeetingInfo {
  id: string;
  password: string;
  joinUrl: string;
}

/**
 * 상담용 미팅 생성. join_before_host 로 호스트 없이 참가자 입장 가능(MVP 는 전문가 계정 없음).
 * 실패 시 예외 — 호출부(예약 라우트)가 데모 링크로 폴백한다.
 */
export async function createZoomMeeting(
  topic: string,
  fetchFn: typeof fetch = fetch
): Promise<ZoomMeetingInfo> {
  const token = await getS2SAccessToken(fetchFn);
  const res = await fetchFn("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic,
      type: 2,
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  if (!res.ok) throw new Error(`Zoom 미팅 생성 실패(${res.status})`);
  const data = await res.json();
  return {
    id: String(data.id),
    password: (data.password as string) ?? "",
    joinUrl: data.join_url as string,
  };
}
