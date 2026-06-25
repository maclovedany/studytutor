# 코치링(Coachring) 웹 MVP — 설계 문서

작성일: 2026-06-26
출처: `prd.md` (전문가 1:1 코칭 상담 플랫폼)

## 1. 목표 / 범위

PRD의 4회차 분량 **웹 MVP 전체**를 단일 Next.js 프로젝트로 구현한다.

구현 대상:
- 회원가입/로그인 (이메일·비밀번호 + 카카오 OAuth)
- role(user/admin) · tier(free/paid) 권한 모델
- 마이페이지, 포인트 조회/내역
- 추천인 코드 + 추천 가입 포인트 지급
- 관리자: 포인트 정책 수정, 메시지 예약 조회, 회원 관리, 상담/결제 조회
- 가입 후 1/3/7일 자동 메시지 예약 생성
- 휴대폰 인증번호 생성/검증 (개발단계 콘솔/응답 노출)
- 상담예약 + Zoom 링크 연결
- 15분 무료 상담 타이머 + 결제 유도 모달
- 데모 결제 → 유료회원(tier=paid) 전환

제외(PRD 5.2):
- 실제 결제사 연동, 실제 SMS 발송, 실제 카카오 알림톡, Zoom SDK 임베드(외부 URL 링크로 대체)
- 전문가 매칭, 실시간 채팅, 녹화, 정산

후속(이번 범위 밖, 웹 완료 후 선택):
- Expo 앱 포인트 조회 화면
- AdMob 광고 구조

## 2. 기술 스택

- **Next.js 15 (App Router) + TypeScript**
- **Tailwind CSS** — 깔끔하고 신뢰감 있는 톤(파랑/차분, 카드 기반)
- **Supabase** — Auth, Postgres, RLS (사용자가 클라우드 프로젝트 키 제공)
- 서버 로직은 Next.js **API Route**에서 `service_role` key로 처리

### 환경 변수 (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # 서버 전용, 클라이언트 노출 금지
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 폴더 구조
```
app/
  (public)/page.tsx              홈
  login/page.tsx                 로그인/회원가입 (?ref=)
  auth/callback/route.ts         OAuth 콜백
  mypage/page.tsx                마이페이지
  points/page.tsx                포인트
  referral/page.tsx              추천인
  consultations/page.tsx         상담예약 목록
  consultations/[id]/page.tsx    상담 진행(타이머/결제모달)
  admin/...                      관리자 화면들
  api/
    auth/after-signup/route.ts   가입 후처리(포인트/메시지/추천)
    phone/send/route.ts          인증번호 발급
    phone/verify/route.ts        인증번호 검증
    consultations/route.ts       상담 생성
    consultations/[id]/start/route.ts
    payments/demo/route.ts       데모 결제
    admin/...                    정책/회원/메시지 관리
lib/
  supabase/client.ts             브라우저 클라이언트(anon)
  supabase/server.ts             서버 컴포넌트 클라이언트
  supabase/admin.ts              service_role 클라이언트(서버 전용)
  points.ts                      포인트 지급 헬퍼(정책 조회 후 event 기록)
  auth.ts                        세션/권한 헬퍼
components/                      공용 UI(네비, 카드, 모달 등)
supabase/migrations/            SQL 마이그레이션
```

## 3. 데이터 모델

PRD 11장 그대로 9개 테이블. 모두 `created_at default now()`.

- **profiles**: id(uuid, =auth.users.id), email, display_name, role(default 'user'), tier(default 'free'), phone, phone_verified_at
- **point_policies**: policy_key(unique), name, points(int), is_active(bool)
- **point_events**: user_id, policy_key, points, reason, related_user_id
- **referral_codes**: user_id, code(unique), is_active
- **referrals**: referrer_id, referred_id(unique → 중복 추천 방지), referral_code
- **phone_verifications**: user_id, phone, code, expires_at, verified_at
- **message_jobs**: user_id, channel, template_key, message, scheduled_at, status(default 'pending'), sent_at
- **consultations**: user_id, zoom_url, status(default 'reserved'), reserved_at, started_at, paid_at, completed_at
- **payments**: user_id, consultation_id, amount, status, payment_provider, paid_at

### 시드 데이터 (point_policies)
| policy_key | name | points |
|---|---|---|
| signup | 신규가입 | 1000 |
| referral_join | 추천 가입자 보상 | 2000 |
| referral_inviter | 추천인 보상 | 3000 |
| consultation_reserved | 상담예약 보상 | 500 |
| payment_completed | 결제완료 보상 | 5000 |

### 핵심 규칙
- **포인트 잔액 컬럼 없음.** 총 포인트 = `sum(point_events.points)`
- 포인트 수치는 코드에 하드코딩하지 않고 `point_policies`에서 읽음. `is_active=false`면 미지급.
- 추천 보상은 `referrals.referred_id` unique 제약으로 중복 방지.

## 4. 권한 / RLS

| 기능 | free user | paid user | admin |
|---|--:|--:|--:|
| 마이페이지/포인트/상담예약 | 가능 | 가능 | 가능 |
| 15분 이후 상담 계속 | 불가 | 가능 | 가능 |
| 관리자 페이지/정책수정/메시지조회 | 불가 | 불가 | 가능 |

RLS 정책:
- `profiles`, `point_events`, `referrals`, `consultations`, `payments`, `message_jobs`, `phone_verifications`: 본인 행만 SELECT. admin은 전체 SELECT.
- 모든 INSERT/UPDATE(포인트 지급, tier 변경, 정책 수정 등)는 **service_role API에서만** 수행(RLS 우회). 클라이언트 직접 쓰기 금지.
- `point_policies`: 전체 SELECT 허용(읽기), 수정은 admin API.

## 5. 주요 흐름

### 5.1 가입 후처리
1. Supabase Auth로 가입(이메일/비번 또는 카카오).
2. DB 트리거가 `auth.users` insert 시 `profiles` 자동 생성(role=user, tier=free) + `referral_codes` 발급.
3. 클라이언트가 `/api/auth/after-signup` 호출(멱등). 서버가:
   - 이미 후처리됐는지 확인(중복 방지)
   - `signup` 정책 활성 시 신규가입 포인트 지급
   - `?ref=` 코드가 있으면 `referrals` 기록 + 가입자/추천인 포인트 지급(정책 활성 시)
   - 1/3/7일 `message_jobs` 3건 생성(channel='kakao', status='pending')

### 5.2 휴대폰 인증
- `/api/phone/send`: 6자리 코드 생성, expires_at = now()+5분, `phone_verifications` 기록. **개발단계: 응답 body + 서버 콘솔에 코드 노출.**
- `/api/phone/verify`: 코드/만료 검증 → 성공 시 `profiles.phone_verified_at` 갱신.
- 인증 완료자만 상담예약 가능(UI 비활성 + API 가드).

### 5.3 상담 / 15분 타이머 / 데모 결제
- `/api/consultations`: 인증 완료자만, `consultations` 생성(status=reserved, zoom_url=데모 링크) + 상담예약 포인트 지급.
- 상담 시작 → `/api/consultations/[id]/start`: `started_at` 저장, status=started.
- 상담진행 페이지: started_at 기준 클라 타이머. 15분 경과 + tier=free → 결제 유도 모달. tier=paid는 모달 미표시, "상담 계속하기" 가능.
- `/api/payments/demo`: `payments` 기록(provider='demo', status='paid') + `profiles.tier=paid` + 상담 status=paid→resumed + 결제완료 포인트 지급.

### 5.4 카카오 로그인
- Supabase Auth Kakao provider 사용. `app/auth/callback/route.ts`에서 세션 교환 후 `after-signup` 동일 적용.
- 필요 설정: Supabase 대시보드 Kakao provider + Redirect URL, 카카오 개발자앱 Redirect URI. README에 단계 안내.

## 6. 관리자 기능
- 회원 목록 + role/tier 변경 (`/api/admin/users`)
- 포인트 정책 조회/수정(name, points, is_active) (`/api/admin/policies`)
- 메시지 예약 목록 조회
- 상담 예약/상태 조회
- 결제 내역 조회
- 모든 admin API는 호출자 role=admin 검증.

## 7. 화면 콘텐츠 설정
홈의 서비스명/메인 문구/CTA는 상수 설정 파일(`lib/site-config.ts`)로 분리해 수정 용이하게.

## 8. 테스트 전략
- 포인트 합계 계산, 정책 비활성 시 미지급, 추천 중복 방지, 휴대폰 인증 만료 검증, 15분 타이머 경계, 데모 결제 후 tier 전환 등 **서버 로직 단위 테스트**(Vitest).
- API Route 핸들러는 순수 함수로 로직 분리 후 테스트.

## 9. 구현 순서 (회차 매핑)
1. 스캐폴드 + 마이그레이션 SQL + 시드 + Supabase 클라/서버/admin + 인증 기반(로그인/마이페이지/관리자 골격, role/tier)
2. 포인트(정책·이벤트·조회) + 추천인 코드 + 추천 가입 포인트 + 관리자 정책 수정
3. 카카오 로그인 + 자동 메시지 예약 + 휴대폰 인증
4. 상담예약 + Zoom 링크 + 15분 타이머 + 데모 결제 + 유료 전환 + 관리자 상담/결제 조회

## 10. 미해결 / 외부 의존
- Supabase URL/anon/service_role key 필요(사용자 제공 예정).
- 카카오 OAuth 실연동은 대시보드 설정 필요(미설정 시 이메일/비번으로 전체 흐름 시연 가능).
