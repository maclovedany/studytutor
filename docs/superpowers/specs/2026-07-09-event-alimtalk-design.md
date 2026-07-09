# 이벤트 기반 카카오 알림톡 자동 발송 — 설계

작성일: 2026-07-09

## 배경 / 목표

가입·결제 같은 사용자 이벤트가 발생하는 순간, 그리고 결제 1일 후에 카카오 **알림톡**을 자동 발송한다.

- **가입 즉시** → "회원가입이 완료되었습니다"
- **결제 즉시** → "구매해주셔서 감사합니다"
- **결제 +1일** → "잘 사용하고 계신가요"

발송은 **알림톡**으로 하며, 알림톡은 카카오 공식 발송대행사를 반드시 경유해야 한다. 본 프로젝트는 이미 **솔라피(Solapi)** 를 얇게 감싼 발송 래퍼(`lib/solapi.ts`)와 예약 큐(`message_jobs`) + 발송 워커(`/api/jobs/dispatch-messages`)를 갖고 있으므로, 그 위에 **이벤트 트리거만** 얹는다.

### 확정된 결정
- 발송 경로: **알림톡 (솔라피 유지)**
- "1일 후" 기준: **결제 시점 +1일**
- 기존 1/3/7일 예약 시퀀스(`welcome_d1`·`remind_d3`·`expire_d7`)는 **본 설계로 대체(제거)**
- 즉시 발송 방식: `message_jobs`에 기록 후 **발송 워커를 그 자리에서 1회 호출**(큰 즉시 트리거)

## 비목표 (Out of scope)
- 실제 결제사(PG) 연동 — 현재의 데모 결제(`runDemoPayment`) 흐름 위에 얹는다.
- 친구톡/브랜드메시지 신규 채널 구축 — `usage_checkin_d1` 심사 반려 시 우회 옵션만 열어둔다.
- 카카오 콘솔/솔라피 콘솔 작업(채널 개설·템플릿 심사) — 코드 밖 수작업(아래 "수작업 항목" 참조).

## 아키텍처

### 1. 메시지 카탈로그 — `lib/messages.ts` (신설)

template_key ↔ 본문 ↔ 발송 시점을 한 곳에서 관리한다(지금은 텍스트가 `after-signup.ts`에 하드코딩되어 흩어져 있음).

```ts
export interface MessageTemplate {
  key: string;       // template_key. env SOLAPI_TEMPLATE_<KEY 대문자>로 알림톡 templateId 매핑
  channel: "kakao";  // 알림톡
  text: string;      // 본문 (알림톡 SMS 대체발송 문구 겸용, 승인 템플릿과 일치해야 함)
}
```

| key | 트리거 | scheduled_at | 본문 초안(심사용, 최종 문구는 템플릿 등록 시 확정) |
|---|---|---|---|
| `signup_done` | 회원가입 | now | "회원가입이 완료되었습니다. 15분 무료 상담을 지금 시작해보세요." |
| `purchase_thanks` | 결제 완료 | now | "결제가 완료되었습니다. 구매해주셔서 감사합니다. 상담 이용이 활성화되었습니다." |
| `usage_checkin_d1` | 결제 완료 | now + 24h | "상담은 잘 이용하고 계신가요? 이용 중 불편한 점이 있으면 언제든 문의해주세요." |

헬퍼: `buildJobRow(userId, template, scheduledAt)` → `message_jobs` insert용 행 객체를 만든다.

### 2. 발송 로직 추출 — `lib/dispatch.ts` (확장)

현재 발송 루프(선점 → 솔라피 발송 → 실패 정정)가 라우트(`/api/jobs/dispatch-messages/route.ts`)에만 있다. 이를 재사용 가능한 함수로 추출한다:

```ts
// send/isConfigured 를 주입 가능하게 하여 단위 테스트 용이(기존 route 주석 철학과 동일)
dispatchDueMessages(admin, opts?: {
  send?: (args) => Promise<void>,   // 기본: sendViaSolapi
  isConfigured?: () => boolean,     // 기본: isSolapiConfigured
  now?: Date,
}): Promise<{ mode: "demo" | "real"; sent: number; failed: number }>
```

동작(기존과 동일):
1. `pending & scheduled_at<=now` 를 원자적 UPDATE(pending→sent)+RETURNING 으로 선점 → 동시 호출 시 중복발송 방지.
2. 솔라피 미설정 → 콘솔 데모 로그(이미 sent 선점됨).
3. 실발송 → 수신 번호(`profiles.phone`) 조회, 없으면 `failed`. 발송 예외 시 `failed` 정정.

`formatDemoLog`(기존)는 유지.

세 호출처:
- `POST /api/jobs/dispatch-messages` (크론/관리자) — 라우트는 이제 `dispatchDueMessages(admin)` 를 호출하는 얇은 래퍼로 축소. 엔드포인트 계약(인증·응답 형태)은 동일 유지 → `admin/messages` DispatchButton 영향 없음.
- 가입 직후 인라인 1회 호출(신규)
- 결제 직후 인라인 1회 호출(신규)

### 3. 트리거 연결

- **`lib/after-signup.ts`**: 기존 `MESSAGE_TEMPLATES`(1/3/7일 3건) 예약 → **`signup_done` 1건(scheduled_at=now)** 으로 교체. 포인트/추천 로직·멱등성 가드는 그대로.
- **`lib/payment.ts`**: `runDemoPayment` 끝에 **`purchase_thanks`(now)** + **`usage_checkin_d1`(now+24h)** 2건 예약 추가.
- **라우트**:
  - `POST /api/auth/after-signup`: `runAfterSignup` 후 `await dispatchDueMessages(admin)` 1회.
  - `POST /api/payments/demo`: `runDemoPayment` 후 `await dispatchDueMessages(admin)` 1회.
  - 인라인 dispatch 는 try/catch 로 감싸 **발송 실패가 가입/결제 응답을 실패시키지 않게** 한다. job 은 기록으로 남는다.

도메인 함수(`runAfterSignup`/`runDemoPayment`)는 **행 insert만** 담당하고(테스트 용이), **발송 트리거는 라우트가 오케스트레이션**한다 — 도메인 로직과 외부 전송의 결합을 피한다.

### 4. 데이터 흐름

```
가입     → runAfterSignup → job(signup_done, now)          ─┐
결제     → runDemoPayment → job(purchase_thanks, now)       ─┼→ dispatchDueMessages() → 솔라피 알림톡
                          → job(usage_checkin_d1, now+24h) ──┘         ↑
결제+1일 도래 → 크론이 POST /api/jobs/dispatch-messages 호출 ───────────┘
```

즉시 발송의 타이밍: `scheduled_at = now(ISO)` 로 insert, 직후 dispatch 가 그보다 뒤 시각으로 `scheduled_at<=now` 조회하므로 새 즉시 job 이 포함된다. `usage_checkin_d1`(now+24h)은 이때 선점되지 않고 pending 으로 남아 크론이 처리.

### 5. 에러 처리 / 폴백 (기존 동작 유지)

- 솔라피 미설정 → 콘솔 데모 로그(개발 환경 그대로 동작).
- `SOLAPI_PFID` 또는 템플릿 미매핑 → `sendViaSolapi` 가 자동 SMS 대체발송.
- 수신 번호(휴대폰 미인증) 없음 → 해당 job `failed`, 건너뜀.
- `SUPABASE_SERVICE_ROLE_KEY` 미설정 → 인라인 dispatch 스킵(가입/결제는 정상 응답).

### 6. 멱등성 주의
- `runAfterSignup` 은 signup 포인트 이벤트로 멱등 → `signup_done` 1회만 insert.
- `runDemoPayment` 은 현재 멱등 가드가 없다(호출마다 payment/메시지 insert). 데모 결제는 사용자 단발 액션이라 실사용상 문제는 낮으나, **결제 메시지 중복 방지 가드는 후속 과제**로 남긴다(본 설계 범위 밖, 스펙에 명시).

## 테스트 (TDD)

- `lib/after-signup.test.ts`: 예약 메시지 3건 → **`signup_done` 1건(now, pending)** 검증으로 갱신.
- `lib/payment.test.ts`: `purchase_thanks`(now) + `usage_checkin_d1`(now+24h) **2건 insert** 검증 추가.
- `lib/dispatch.test.ts`: `dispatchDueMessages` — 가짜 db + 주입 send 로 (a) due pending 선점, (b) send 호출 인자, (c) 번호 없음 → failed, (d) send 예외 → failed 검증.
- 기존 dispatch route 테스트가 있으면 계약 유지 확인.

## 심사 관련 주의 (알림톡 콘텐츠 가이드 반영)

- 알림톡은 **정보성 메시지만 승인**된다.
- `signup_done`·`purchase_thanks` 는 정보성으로 무난.
- **`usage_checkin_d1`("잘 사용하고 계신가요")은 마케팅/불필요성으로 반려 위험이 있다.** 대응:
  1. 정보성 문구로 다듬기(상담 이용/남은 혜택 안내 등), 또는
  2. 이 건만 **친구톡(광고성 가능·채널 친구 대상)** 또는 SMS 로 우회.
- 구현은 template_key 기반이라 우회 시 해당 키의 채널/템플릿 매핑만 바꾸면 되도록 카탈로그를 단일 소스로 유지한다.

## 수작업 항목 (코드로 자동화 불가 — 사업자/개발자 콘솔 작업)

1. **솔라피 가입** → API Key/Secret 발급, **발신번호(SMS) 등록**(통신서류 제출).
2. **카카오 비즈니스 채널 개설** → **발신프로필(pfId)** 솔라피 연동.
3. **알림톡 템플릿 3종 등록 + 심사 승인**(영업일 2일). 변수엔 예시 텍스트 필수. `usage_checkin_d1` 문구 정보성으로.
4. **환경변수 설정**:
   `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_PHONE`, `SOLAPI_PFID`,
   `SOLAPI_TEMPLATE_SIGNUP_DONE`, `SOLAPI_TEMPLATE_PURCHASE_THANKS`, `SOLAPI_TEMPLATE_USAGE_CHECKIN_D1`.
5. **크론 스케줄러 연결**: `CRON_SECRET` + 주기적으로 `POST /api/jobs/dispatch-messages` 호출(결제+1일 건 발송용). Vercel Cron 등.
6. **휴대폰 인증 유도**: 알림톡은 수신자 전화번호 필요 → `profiles.phone` 없으면 발송 안 됨(이미 그렇게 처리됨).

코드 측 제공물: `.env.example` 갱신 + 위 항목 README/문서화.
