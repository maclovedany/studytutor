# Zoom 미팅 임베드 + 15분 강제 결제 게이트 — 설계

작성일: 2026-07-10

## 배경 / 목표

현재 상담 Room 은 하드코딩 데모 Zoom 링크(`DEMO_ZOOM_URL`)를 외부로 여는 구조라, 15분 결제 유도 모달이 **웹 페이지에만** 뜨고 Zoom 화면에 있는 사용자는 보지 못한다. 이를 **Zoom Meeting SDK(Component View) 임베드**로 바꿔:

- 미팅이 Room 페이지 **안에서** 진행되고,
- 15분 도달(무료회원) 시 **통화에서 자동 퇴장** + 결제 모달 표시,
- 결제 완료 시 **같은 미팅에 자동 재입장**하여 이어서 상담한다.

### 확정된 결정
- 방식: **① Meeting SDK 웹 임베드** (② API 강제종료 대신). 15분 시 **자동 퇴장 + 결제 후 재입장**.
- **서버 강제 포함**: 입장 서명 발급 API가 "무료회원 & 15분 경과 & 미결제"면 403 → 새로고침으로 우회 불가.
- 미팅 생성 시점: **예약 시** (Zoom 미설정이면 기존 데모 링크 폴백 — 프로젝트의 데모 폴백 패턴 유지).
- 외부 링크 버튼("Zoom 앱으로 열기")은 **보조로 유지** (모바일/SDK 장애 대비).

### 검증된 사실 (2026-07 기준)
- SDK 패키지: `@zoom/meetingsdk` v6.2.0, 임베드는 Component View.
- 입장 서명: 서버에서 SDK Client Secret 으로 서명한 **JWT(HS256)** — 클레임 `appKey`(=SDK Client ID), `sdkKey`(호환), `mn`, `role`, `iat`, `exp`, `tokenExp`. `exp`는 `iat+1800` 이상 필수.
- 미팅 생성: **Server-to-Server OAuth** 토큰(`grant_type=account_credentials`) → `POST /v2/users/me/meetings`.
- 1:1 미팅은 Zoom 무료 플랜에서 시간 제한 없음.

## 비목표 (Out of scope)
- Zoom API 강제 종료(②) — ① 위에 후속으로 얹을 수 있는 옵션으로만 남긴다.
- 전문가(호스트) 계정 체계 — MVP엔 전문가 역할이 없으므로 미팅은 플랫폼 Zoom 계정 명의로 생성하고 `join_before_host` 로 참가자만 입장.
- 상담 status 상태머신 보완(`payment_required` 등 DB 전이) — 게이트는 서명 API 에서 tier+경과시간으로 판정.
- 모바일(Expo) 앱 반영.

## 아키텍처

### 흐름
```
예약  → Zoom 설정 시: S2S 토큰 → 미팅 생성 → consultations 에 meeting_id/password/join_url 저장
       (미설정/실패 시: 기존 DEMO_ZOOM_URL — 예약은 절대 실패하지 않음)
시작  → started_at 저장(기존) → Room 이 ZoomMeeting 컴포넌트 마운트
        → POST /api/zoom/signature → (게이트 통과 시) 서명 → SDK join
15:00 → shouldShowPaywall true → Room 이 ZoomMeeting 언마운트(=leave) + 결제 모달(기존)
결제  → tier=paid → router.refresh → paywall false → ZoomMeeting 재마운트
        → 새 서명(이번엔 paid 라 서버 허용) → 같은 미팅 재입장
```

### 구성 요소

| 파일 | 역할 |
|---|---|
| `lib/zoom.ts` (신설, server-only) | `isZoomConfigured()` / `getS2SAccessToken(fetch)` / `createZoomMeeting(topic, fetch)` / `generateSdkSignature({meetingNumber, role, now})` — JWT 는 node:crypto 로 직접 서명(신규 의존성 없음). fetch 주입으로 테스트 가능 |
| `supabase/migrations/0004_zoom.sql` | `consultations` 에 `zoom_meeting_id text`, `zoom_password text` 추가 (+ `setup_all.sql` 동기화) |
| `app/api/consultations/route.ts` (수정) | 예약 시 Zoom 설정되어 있으면 미팅 생성·저장, 실패/미설정 시 데모 링크 폴백 |
| `app/api/zoom/signature/route.ts` (신설) | 인증 + 본인 상담 확인 + `zoom_meeting_id` 존재 확인 + **`shouldShowPaywall` 게이트(403)** → `{signature, meetingNumber, password, userName}` |
| `components/ZoomMeeting.tsx` (신설, client) | `@zoom/meetingsdk/embedded` dynamic import → init/join, 언마운트 시 leave. 서명 403 → 조용히 미표시(모달이 안내), 기타 오류 → 안내 문구 + 외부 링크 폴백 |
| `app/consultations/[id]/Room.tsx` (수정) | `zoom_meeting_id` 있으면 임베드 렌더(started && !paywall 일 때만), 없으면 기존 외부 링크 UI 그대로. 외부 링크는 보조 버튼으로 유지 |
| `package.json` (수정) | `@zoom/meetingsdk` ^6.2.0 추가 |

### 게이트 로직 (서버 강제)
서명 라우트에서 기존 검증된 순수 함수를 재사용한다:
```ts
if (shouldShowPaywall({ tier: profile.tier }, consultation.started_at, new Date()))
  return 403 { error: "payment_required" }
```
- 유료회원: 항상 통과. 무료회원: 시작 전이거나 15분 이내만 통과.
- 클라이언트 타이머(UX)와 서버 게이트(강제)가 같은 함수 기준 → 판정 불일치 없음.

### JWT 서명 (신규 의존성 없이)
`node:crypto` 의 HMAC-SHA256 + base64url 로 직접 구현(~15줄). 클레임:
`{ appKey, sdkKey: appKey, mn: String(meetingNumber), role: 0, iat, exp: iat+7200, tokenExp: iat+7200 }`
클라이언트에는 서명 문자열만 전달 — SDK Client ID/Secret 모두 서버 밖으로 나가지 않는다.

### 미팅 생성 파라미터
`POST /v2/users/me/meetings` body:
`{ topic: "코치링 상담", type: 2, settings: { join_before_host: true, waiting_room: false } }`
→ 응답의 `id`(meeting number), `password`, `join_url` 저장. 참가자는 role 0 으로 SDK 입장, 전문가는 `join_url` 로 외부 입장(MVP).

## 환경변수 (서버 전용, NEXT_PUBLIC 없음)
```
ZOOM_ACCOUNT_ID=          # Server-to-Server OAuth 앱
ZOOM_S2S_CLIENT_ID=
ZOOM_S2S_CLIENT_SECRET=
ZOOM_SDK_CLIENT_ID=       # General App(Meeting SDK)
ZOOM_SDK_CLIENT_SECRET=
```
다섯 개 모두 있어야 `isZoomConfigured()` true. 미설정 시 전 기능이 기존(데모 링크+클라이언트 타이머)과 동일 동작.

## 에러 처리
- 예약 시 Zoom API 실패 → 데모 링크로 폴백, 예약 성공 유지(콘솔 경고).
- 서명 403(결제 필요) → 임베드 미표시, 기존 결제 모달이 안내.
- 서명 기타 오류/SDK 로드 실패 → "임베드를 불러오지 못했습니다" + 외부 링크 버튼으로 상담 지속 가능.
- 데모 상담(zoom_meeting_id 없음) → 서명 라우트 400, Room 은 기존 UI.

## 테스트 (TDD)
- `lib/zoom.test.ts`:
  - `isZoomConfigured` — env 5종 유/무.
  - `generateSdkSignature` — JWT 3분할 파싱, 클레임(appKey/mn/role/exp−iat≥1800/tokenExp=exp) 검증, HMAC 재계산으로 서명 일치 확인.
  - `createZoomMeeting` — fake fetch 주입: 토큰 요청(Basic auth, account_credentials)과 미팅 생성 요청(bearer, body)·응답 파싱 검증.
- 서명 라우트의 게이트는 기존 `lib/timer.test.ts` 가 커버하는 `shouldShowPaywall` 재사용 — 라우트는 얇게 유지(프로젝트 패턴).
- 기존 41개 테스트 무영향 확인. SDK 임베드 UI 는 실기기 수동 검증(사용자).

## 수작업 항목 (사용자)
1. [marketplace.zoom.us](https://marketplace.zoom.us) → **Server-to-Server OAuth 앱** 생성, `meeting:write` 계열 스코프 부여 → Account ID/Client ID/Secret.
2. **General App(Meeting SDK)** 생성 → SDK Client ID/Secret.
3. `.env.local` 에 ZOOM_* 5종 입력 후 서버 재시작.
4. 실브라우저에서 예약→시작→15분(테스트 시 `FREE_LIMIT_SECONDS` 임시 축소)→퇴장/모달→결제→재입장 확인.

## 후속 과제 (범위 밖)
- 미결제 N분 경과 시 Zoom API 로 미팅 강제 종료(② 결합).
- 전문가 계정/호스트 입장 체계.
- consultations 상태머신(`payment_required`/`completed`) 정리.
