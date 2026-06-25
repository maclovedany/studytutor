# 코치링 (Coachring)

전문가와 사용자를 연결하는 1:1 코칭 상담 플랫폼 웹 MVP.
15분 무료 상담 → 결제 유도 → 유료 전환까지의 흐름을 데모로 구현했습니다.

- 기술 스택: **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase · Vitest**
- 설계 문서: `docs/superpowers/specs/2026-06-26-coachring-web-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-06-26-coachring-web-mvp.md`
- 제품 요구사항: `prd.md`

---

## 1. 빠른 시작

```bash
npm install
cp .env.local.example .env.local   # 아래 값 채우기
npm run dev                        # http://localhost:3000
```

### 환경 변수 (`.env.local`)

Supabase 대시보드 → **Project Settings → API** 에서 복사합니다.

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key (클라이언트용) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key — **서버 전용, 절대 클라이언트에 노출 금지** |
| `NEXT_PUBLIC_SITE_URL` | 사이트 URL (기본 `http://localhost:3000`) |

---

## 2. Supabase 설정

### 2.1 마이그레이션 실행

Supabase 대시보드 → **SQL Editor** 에서 아래 파일을 **순서대로** 붙여넣고 실행합니다.

1. `supabase/migrations/0001_init.sql` — 테이블 9개
2. `supabase/migrations/0002_rls.sql` — RLS 정책
3. `supabase/migrations/0003_triggers.sql` — 가입 트리거(profiles/추천코드 자동 생성)
4. `supabase/seed.sql` — 포인트 정책 시드

### 2.2 관리자 지정

회원가입을 한 뒤, 본인 계정을 관리자로 올립니다(SQL Editor):

```sql
update profiles set role = 'admin' where email = '내이메일@example.com';
```

### 2.3 카카오 로그인 (선택)

미설정 시에도 **이메일/비밀번호 로그인**으로 전체 흐름을 시연할 수 있습니다.

1. [카카오 개발자](https://developers.kakao.com) 앱 생성 → REST API 키 발급
2. 카카오 앱 → **카카오 로그인 활성화**, Redirect URI 에
   `https://<프로젝트>.supabase.co/auth/v1/callback` 등록
3. Supabase 대시보드 → **Authentication → Providers → Kakao** 활성화 후
   REST API 키/Client Secret 입력
4. Supabase **Authentication → URL Configuration** 의 Redirect URLs 에
   `http://localhost:3000/auth/callback` 추가

---

## 3. 테스트

```bash
npm test        # Vitest 단위 테스트 (포인트/인증/타이머/결제 로직)
npm run build   # 프로덕션 빌드 검증
```

비즈니스 로직은 `lib/`의 순수 함수로 분리되어 Supabase 연결 없이 검증됩니다.

---

## 4. 데모 시나리오

1. 회원가입(추천 링크 `?ref=코드` 사용 가능) → 마이페이지에서 **신규가입 1000P** 확인
2. 추천인 페이지에서 내 추천코드/링크 복사
3. 마이페이지에서 **휴대폰 인증**(개발 단계: 인증번호가 화면/콘솔에 표시됨)
4. 인증 후 **상담 예약**(+500P) → 상담 시작 → Zoom 링크
5. **15분 경과** 시 결제 유도 모달 → **데모 결제** → 유료회원(paid) 전환(+5000P)
6. 관리자 페이지: 회원 등급/권한 변경, 포인트 정책 수정, 메시지 예약/상담/결제 조회

> 개발 단계 인증번호는 `/api/phone/send` 응답과 서버 콘솔에 노출됩니다(실 SMS 미발송).
