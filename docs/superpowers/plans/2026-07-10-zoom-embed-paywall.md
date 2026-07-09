# Zoom 임베드 + 15분 결제 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담 Room 안에 Zoom 미팅을 임베드하고, 무료회원 15분 도달 시 자동 퇴장+결제 모달, 결제 시 같은 미팅 자동 재입장을 구현한다.

**Architecture:** 예약 시 Server-to-Server OAuth 로 실제 Zoom 미팅을 생성해 `consultations` 에 저장. 입장 서명은 서버 JWT 발급 API 가 `shouldShowPaywall` 게이트(무료+15분 경과 → 403)를 거쳐 반환 — 서버 강제. 클라이언트는 Zoom CDN 전역 번들(Component View)로 임베드한다. Zoom env 미설정 시 기존 데모 링크 동작 100% 유지.

**Tech Stack:** Next.js(App Router), TypeScript, node:crypto(JWT 직접 서명 — 신규 npm 의존성 없음), Zoom CDN `zoom-meeting-embedded-6.2.0.min.js`, Vitest.

## Global Constraints

- **npm 에 `@zoom/meetingsdk` 를 추가하지 않는다** — 6.2.0 이 `react@18.2.0` 고정 peer 라 웹(React 19)과 충돌(설치 실패 실측). CDN 전역 번들 + 최소 로컬 타입 선언으로 대체한다.
- 검증된 SDK API(패키지 d.ts 실측): `window.ZoomMtgEmbedded.createClient()` → `client.init({zoomAppRoot, language})` → `client.join({signature, meetingNumber: string, password?, userName})` → `client.leaveMeeting()`.
- 서명 JWT 클레임: `{ appKey, sdkKey, mn: string, role, iat, exp, tokenExp }`, `exp ≥ iat+1800`, HS256.
- env 5종(서버 전용): `ZOOM_ACCOUNT_ID`, `ZOOM_S2S_CLIENT_ID`, `ZOOM_S2S_CLIENT_SECRET`, `ZOOM_SDK_CLIENT_ID`, `ZOOM_SDK_CLIENT_SECRET`. 클라이언트로는 서명 문자열만 나간다.
- Zoom 미설정/실패 시 예약은 절대 실패하지 않고 기존 `DEMO_ZOOM_URL` 폴백.
- 테스트: `npm test`(vitest). 각 태스크 후 `npx tsc --noEmit -p tsconfig.json` + eslint.
- `.env.local.example` 은 gitignored(`.env*`) — 로컬만 갱신, 커밋하지 않는다.

## File Structure

- Create: `lib/zoom.ts`, `lib/zoom.test.ts` — Zoom 서버 로직(설정 감지/토큰/미팅 생성/서명)
- Create: `supabase/migrations/0004_zoom.sql`, Modify: `supabase/setup_all.sql` — 컬럼 추가
- Modify: `lib/types.ts` — Consultation 에 zoom_meeting_id/zoom_password
- Modify: `app/api/consultations/route.ts` — 예약 시 미팅 생성
- Create: `app/api/zoom/signature/route.ts` — 서명 발급 + 결제 게이트
- Create: `components/ZoomMeeting.tsx` — CDN 임베드 클라이언트 컴포넌트
- Modify: `app/consultations/[id]/Room.tsx` — 임베드 통합(퇴장/재입장)

---

## Task 1: `lib/zoom.ts` — 설정/서명/미팅 생성 (TDD)

**Files:**
- Create: `lib/zoom.ts`
- Test: `lib/zoom.test.ts`

**Interfaces:**
- Produces:
  - `isZoomConfigured(): boolean` — env 5종 모두 존재 여부
  - `generateSdkSignature(opts: { meetingNumber: string; role?: number; now?: Date }): string` — SDK 입장 JWT
  - `getS2SAccessToken(fetchFn?: typeof fetch): Promise<string>`
  - `createZoomMeeting(topic: string, fetchFn?: typeof fetch): Promise<{ id: string; password: string; joinUrl: string }>`

- [ ] **Step 1: 실패 테스트 작성 — `lib/zoom.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  isZoomConfigured,
  generateSdkSignature,
  createZoomMeeting,
} from "./zoom";

const ENV_KEYS = [
  "ZOOM_ACCOUNT_ID",
  "ZOOM_S2S_CLIENT_ID",
  "ZOOM_S2S_CLIENT_SECRET",
  "ZOOM_SDK_CLIENT_ID",
  "ZOOM_SDK_CLIENT_SECRET",
] as const;

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    process.env[k] = `test-${k.toLowerCase()}`;
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isZoomConfigured", () => {
  it("5종 env 가 모두 있으면 true", () => {
    expect(isZoomConfigured()).toBe(true);
  });
  it("하나라도 없으면 false", () => {
    delete process.env.ZOOM_SDK_CLIENT_SECRET;
    expect(isZoomConfigured()).toBe(false);
  });
});

describe("generateSdkSignature", () => {
  it("JWT 클레임과 HMAC 서명이 올바르다", () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const token = generateSdkSignature({ meetingNumber: "123456789", role: 0, now });
    const [h, p, sig] = token.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());

    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(payload.appKey).toBe(process.env.ZOOM_SDK_CLIENT_ID);
    expect(payload.sdkKey).toBe(process.env.ZOOM_SDK_CLIENT_ID);
    expect(payload.mn).toBe("123456789");
    expect(payload.role).toBe(0);
    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(1800);
    expect(payload.tokenExp).toBe(payload.exp);

    const expected = createHmac("sha256", process.env.ZOOM_SDK_CLIENT_SECRET!)
      .update(`${h}.${p}`)
      .digest("base64url");
    expect(sig).toBe(expected);
  });
});

describe("createZoomMeeting", () => {
  it("토큰 발급 후 미팅을 생성하고 id/password/joinUrl 을 반환한다", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("zoom.us/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "tok-1" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ id: 987654321, password: "pw12", join_url: "https://zoom.us/j/987654321" }),
        { status: 200 }
      );
    }) as typeof fetch;

    const meeting = await createZoomMeeting("코치링 상담", fakeFetch);

    expect(meeting).toEqual({
      id: "987654321",
      password: "pw12",
      joinUrl: "https://zoom.us/j/987654321",
    });
    // 1) 토큰 요청: account_credentials + Basic auth
    expect(calls[0].url).toContain("grant_type=account_credentials");
    expect(calls[0].url).toContain(`account_id=${process.env.ZOOM_ACCOUNT_ID}`);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    // 2) 미팅 생성: bearer + join_before_host
    expect(calls[1].url).toBe("https://api.zoom.us/v2/users/me/meetings");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body.settings.join_before_host).toBe(true);
  });

  it("토큰 발급 실패 시 예외를 던진다", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    await expect(createZoomMeeting("t", fakeFetch)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/zoom.test.ts`
Expected: FAIL — `Cannot find module './zoom'`.

- [ ] **Step 3: 구현 — `lib/zoom.ts`**

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/zoom.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/zoom.ts lib/zoom.test.ts
git commit -m "feat: Zoom S2S 미팅 생성 + SDK 입장 서명(JWT) 서버 로직

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: 스키마 + 타입 — zoom_meeting_id/zoom_password

**Files:**
- Create: `supabase/migrations/0004_zoom.sql`
- Modify: `supabase/setup_all.sql` (파일 끝에 섹션 추가)
- Modify: `lib/types.ts:85-95` (Consultation)

**Interfaces:**
- Produces: `Consultation.zoom_meeting_id: string | null`, `Consultation.zoom_password: string | null` — Task 3/4/5 가 사용.

- [ ] **Step 1: 마이그레이션 생성 — `supabase/migrations/0004_zoom.sql`**

```sql
-- Zoom 임베드: 예약 시 생성한 실제 미팅 식별자 저장 (없으면 데모 링크 전용 상담)
alter table consultations add column if not exists zoom_meeting_id text;
alter table consultations add column if not exists zoom_password text;
```

- [ ] **Step 2: `supabase/setup_all.sql` 파일 끝에 동일 섹션 추가**

```sql

-- ===== 0004_zoom =====
alter table consultations add column if not exists zoom_meeting_id text;
alter table consultations add column if not exists zoom_password text;
```

- [ ] **Step 3: `lib/types.ts` Consultation 확장**

기존:
```ts
export interface Consultation {
  id: string;
  user_id: string;
  zoom_url: string | null;
  status: ConsultationStatus;
```
을 아래로 교체:
```ts
export interface Consultation {
  id: string;
  user_id: string;
  zoom_url: string | null;
  zoom_meeting_id: string | null;
  zoom_password: string | null;
  status: ConsultationStatus;
```

- [ ] **Step 4: 검증 + Commit**

Run: `npx tsc --noEmit -p tsconfig.json && npm test 2>&1 | tail -3`
Expected: tsc 무출력, 46 tests passed (41 + Task 1 의 5).

```bash
git add supabase/migrations/0004_zoom.sql supabase/setup_all.sql lib/types.ts
git commit -m "feat: consultations 에 zoom_meeting_id/zoom_password 컬럼 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

주: 실 DB 반영은 사용자가 Supabase SQL Editor 에서 0004_zoom.sql(또는 setup_all 재실행)을 실행해야 한다 — 완료 보고에 명시.

---

## Task 3: 예약 라우트 — Zoom 미팅 생성 + 폴백

**Files:**
- Modify: `app/api/consultations/route.ts`

**Interfaces:**
- Consumes: `isZoomConfigured`, `createZoomMeeting` (Task 1), 컬럼(Task 2).

- [ ] **Step 1: import 추가 및 insert 로직 교체**

import 에 추가:
```ts
import { isZoomConfigured, createZoomMeeting } from "@/lib/zoom";
```

기존:
```ts
  const { data: consultation, error } = await admin
    .from("consultations")
    .insert({ user_id: user.id, zoom_url: DEMO_ZOOM_URL, status: "reserved" })
    .select()
    .single();
```
을 아래로 교체:
```ts
  // Zoom 설정 시 실제 미팅 생성(임베드용). 실패해도 예약은 데모 링크로 진행.
  let zoomFields: {
    zoom_url: string;
    zoom_meeting_id?: string;
    zoom_password?: string;
  } = { zoom_url: DEMO_ZOOM_URL };
  if (isZoomConfigured()) {
    try {
      const meeting = await createZoomMeeting("코치링 상담");
      zoomFields = {
        zoom_url: meeting.joinUrl,
        zoom_meeting_id: meeting.id,
        zoom_password: meeting.password,
      };
    } catch (e) {
      console.warn("[코치링] Zoom 미팅 생성 실패 — 데모 링크로 폴백:", e);
    }
  }

  const { data: consultation, error } = await admin
    .from("consultations")
    .insert({ user_id: user.id, ...zoomFields, status: "reserved" })
    .select()
    .single();
```

- [ ] **Step 2: 검증 + Commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint app/api/consultations/route.ts && npm test 2>&1 | tail -3`
Expected: 모두 통과.

```bash
git add app/api/consultations/route.ts
git commit -m "feat: 예약 시 Zoom 미팅 자동 생성(미설정/실패 시 데모 링크 폴백)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: 서명 라우트 — 결제 게이트 포함

**Files:**
- Create: `app/api/zoom/signature/route.ts`

**Interfaces:**
- Consumes: `isZoomConfigured`, `generateSdkSignature` (Task 1), `shouldShowPaywall` (`lib/timer.ts`, 기존).
- Produces: `POST /api/zoom/signature` `{consultationId}` → 200 `{ok, signature, meetingNumber, password, userName}` / 403 `{error:"payment_required"}` / 400·404·503. ZoomMeeting(Task 5)이 호출.

- [ ] **Step 1: 라우트 생성**

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isZoomConfigured, generateSdkSignature } from "@/lib/zoom";
import { shouldShowPaywall } from "@/lib/timer";
import type { Tier } from "@/lib/types";

/**
 * Meeting SDK 입장 서명 발급 — 본인 상담만.
 * 서버 강제 게이트: 무료회원 & 15분 경과 & 미결제면 403(payment_required)
 * → 결제 모달을 새로고침으로 우회할 수 없다. 클라이언트 타이머와 같은
 *   shouldShowPaywall 을 쓰므로 판정 기준이 일치한다.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isZoomConfigured()) {
    return NextResponse.json({ error: "zoom_not_configured" }, { status: 503 });
  }

  let consultationId: string | undefined;
  try {
    consultationId = (await request.json())?.consultationId;
  } catch {
    consultationId = undefined;
  }
  if (!consultationId) {
    return NextResponse.json({ error: "consultationId 필요" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: consultation } = await admin
    .from("consultations")
    .select("id, user_id, zoom_meeting_id, zoom_password, started_at")
    .eq("id", consultationId)
    .maybeSingle();
  if (!consultation || consultation.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!consultation.zoom_meeting_id) {
    return NextResponse.json(
      { error: "임베드 미지원 상담(데모 링크 전용)" },
      { status: 400 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("tier, display_name")
    .eq("id", user.id)
    .maybeSingle();
  const tier = ((profile?.tier as Tier) ?? "free") satisfies Tier;

  if (shouldShowPaywall({ tier }, consultation.started_at, new Date())) {
    return NextResponse.json({ error: "payment_required" }, { status: 403 });
  }

  const signature = generateSdkSignature({
    meetingNumber: consultation.zoom_meeting_id,
    role: 0,
  });
  return NextResponse.json({
    ok: true,
    signature,
    meetingNumber: consultation.zoom_meeting_id,
    password: consultation.zoom_password ?? "",
    userName: profile?.display_name ?? "회원",
  });
}
```

- [ ] **Step 2: 검증 + Commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint app/api/zoom/signature/route.ts && npm test 2>&1 | tail -3`
Expected: 모두 통과.

```bash
git add app/api/zoom/signature/route.ts
git commit -m "feat: Zoom 입장 서명 API + 15분 결제 서버 게이트(403)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: ZoomMeeting 컴포넌트 + Room 통합

**Files:**
- Create: `components/ZoomMeeting.tsx`
- Modify: `app/consultations/[id]/Room.tsx`

**Interfaces:**
- Consumes: `POST /api/zoom/signature` (Task 4), `Consultation.zoom_meeting_id` (Task 2).
- Produces: `<ZoomMeeting consultationId={string} />` — 마운트 시 서명 fetch→SDK join, 언마운트 시 leaveMeeting.

- [ ] **Step 1: `components/ZoomMeeting.tsx` 생성**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

const SDK_VERSION = "6.2.0";
const SDK_URL = `https://source.zoom.us/${SDK_VERSION}/zoom-meeting-embedded-${SDK_VERSION}.min.js`;

// Zoom CDN 전역 번들의 최소 타입 선언.
// npm 패키지(@zoom/meetingsdk)는 react@18.2.0 고정 peer 라 React 19 웹과 충돌 → CDN 사용.
interface EmbeddedClientLike {
  init(opts: { zoomAppRoot: HTMLElement; language?: string }): Promise<void>;
  join(opts: {
    signature: string;
    meetingNumber: string;
    password?: string;
    userName: string;
  }): Promise<void>;
  leaveMeeting(): Promise<void>;
}
declare global {
  interface Window {
    ZoomMtgEmbedded?: { createClient(): EmbeddedClientLike };
  }
}

/** CDN 스크립트를 1회만 주입하고 로드를 기다린다. */
function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.ZoomMtgEmbedded) return resolve();
    const existing = document.getElementById(
      "zoom-sdk-script"
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Zoom SDK 로드 실패"))
      );
      return;
    }
    const s = document.createElement("script");
    s.id = "zoom-sdk-script";
    s.src = SDK_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Zoom SDK 로드 실패"));
    document.body.appendChild(s);
  });
}

/**
 * Room 안에 Zoom 미팅을 임베드한다.
 *  - 마운트: 서명 발급(서버 게이트 통과 시) → SDK init/join
 *  - 언마운트: leaveMeeting → 15분 페이월 때 Room 이 언마운트하면 자동 퇴장,
 *    결제 후 재마운트하면 새 서명으로 재입장된다.
 *  - 서명 403(결제 필요)은 조용히 넘어간다 — Room 의 결제 모달이 안내.
 */
export default function ZoomMeeting({
  consultationId,
}: {
  consultationId: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<EmbeddedClientLike | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/zoom/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultationId }),
        });
        if (res.status === 403) return; // 결제 필요 — 모달이 안내
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "서명 발급 실패");

        await loadSdk();
        if (cancelled || !rootRef.current || !window.ZoomMtgEmbedded) return;

        const client = window.ZoomMtgEmbedded.createClient();
        clientRef.current = client;
        await client.init({ zoomAppRoot: rootRef.current, language: "ko-KR" });
        await client.join({
          signature: body.signature,
          meetingNumber: body.meetingNumber,
          password: body.password,
          userName: body.userName,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "미팅 연결 실패");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
      clientRef.current?.leaveMeeting().catch(() => {});
      clientRef.current = null;
    };
  }, [consultationId]);

  if (error) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        미팅 임베드를 불러오지 못했습니다 — 아래 Zoom 링크로 입장해 주세요. ({error})
      </p>
    );
  }
  return <div ref={rootRef} className="min-h-80 w-full" />;
}
```

- [ ] **Step 2: `Room.tsx` 통합**

(a) import 추가:
```tsx
import ZoomMeeting from "@/components/ZoomMeeting";
```

(b) 시작 후 렌더 블록에서, 기존 타이머 Card 의 Zoom 버튼 부분:
```tsx
        <div className="mt-5">
          <ButtonLink
            href={consultation.zoom_url ?? "#"}
            target="_blank"
            variant="secondary"
          >
            Zoom으로 입장하기
          </ButtonLink>
        </div>
      </Card>
```
을 아래로 교체(임베드 상담이면 임베드 + 보조 링크, 데모 상담이면 기존 그대로):
```tsx
        <div className="mt-5">
          <ButtonLink
            href={consultation.zoom_url ?? "#"}
            target="_blank"
            variant={consultation.zoom_meeting_id ? "ghost" : "secondary"}
          >
            {consultation.zoom_meeting_id ? "Zoom 앱으로 열기" : "Zoom으로 입장하기"}
          </ButtonLink>
        </div>
      </Card>

      {/* 임베드 미팅 — 페이월이 뜨면 언마운트(자동 퇴장), 결제 후 재마운트(재입장) */}
      {consultation.zoom_meeting_id && !paywall && (
        <Card>
          <ZoomMeeting consultationId={consultation.id} />
        </Card>
      )}
```

- [ ] **Step 3: 검증 + Commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components/ZoomMeeting.tsx "app/consultations/[id]/Room.tsx" && npm test 2>&1 | tail -3`
Expected: 모두 통과.

```bash
git add components/ZoomMeeting.tsx "app/consultations/[id]/Room.tsx"
git commit -m "feat: Room 에 Zoom 미팅 임베드(15분 자동 퇴장/결제 후 재입장)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: env 예시(로컬) + 마무리 검증

**Files:**
- Modify: `.env.local.example` (gitignored — 커밋하지 않음, 로컬 참고용)

- [ ] **Step 1: `.env.local.example` 끝에 추가(로컬만)**

```
# Zoom 임베드 — 5종 모두 있어야 실미팅 생성+임베드, 없으면 데모 링크 폴백.
ZOOM_ACCOUNT_ID=           # Server-to-Server OAuth 앱 (미팅 생성)
ZOOM_S2S_CLIENT_ID=
ZOOM_S2S_CLIENT_SECRET=
ZOOM_SDK_CLIENT_ID=        # General App(Meeting SDK) — 임베드 입장 서명
ZOOM_SDK_CLIENT_SECRET=
```

- [ ] **Step 2: 전체 검증**

Run: `npm test 2>&1 | tail -3 && npx tsc --noEmit -p tsconfig.json && npx eslint .`
Expected: 46 tests passed, tsc/eslint 무출력.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build 2>&1 | tail -5`
Expected: 빌드 성공 (CDN 로드는 클라이언트 런타임 전용이라 빌드 무관).

---

## Self-Review (완료됨)

**1. Spec coverage:** 미팅 생성(Task 3) / 서명+서버 게이트(Task 4) / 임베드+퇴장+재입장(Task 5) / 폴백(Task 3·5) / 스키마(Task 2) / env(Task 6) / 테스트(Task 1). ✓
**2. Placeholder scan:** 전 스텝 실코드/명령/기대출력 포함. ✓
**3. Type consistency:** `generateSdkSignature({meetingNumber, role, now})`, `createZoomMeeting(topic, fetchFn)` → `{id,password,joinUrl}`, 서명 응답 `{signature, meetingNumber, password, userName}`, `Consultation.zoom_meeting_id/zoom_password` 가 태스크 전반 일치. `shouldShowPaywall({tier}, startedAt, now)` 는 Room.tsx 기존 사용법과 동일. ✓

## 주의(후속/수작업)
- 사용자: Zoom 콘솔 앱 2종 생성 + env 5종 + **Supabase 에 0004_zoom.sql 실행** + 실브라우저 검증.
- React strict mode(dev)에서 effect 이중 실행 시 join 이 한 번 leave 될 수 있음 — cancelled 가드로 완화, 실동작 확인은 사용자 수동 테스트.
- 미결제 시 Zoom API 강제 종료(②)는 후속 옵션.
