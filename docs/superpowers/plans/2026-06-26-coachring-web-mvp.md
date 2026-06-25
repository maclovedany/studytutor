# 코치링(Coachring) 웹 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRD의 코칭 상담 플랫폼 "코치링" 웹 MVP 전체(가입·포인트·추천·인증·메시지·상담·15분타이머·데모결제)를 단일 Next.js + Supabase 앱으로 구현한다.

**Architecture:** Next.js 15 App Router 단일 앱. 클라이언트는 Supabase anon key로 읽기, 모든 쓰기(포인트 지급, tier 변경, 인증, 정책 수정)는 `service_role` key를 쓰는 API Route에서만 수행. 비즈니스 로직은 순수 함수(`lib/`)로 분리해 Vitest로 단위 테스트하고, API Route는 그 함수를 호출하는 얇은 어댑터로 둔다.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Supabase(Auth/Postgres/RLS), Vitest.

## Global Constraints

- 포인트 수치는 코드에 하드코딩 금지 — 항상 `point_policies` 테이블에서 읽는다.
- 포인트 잔액 컬럼 없음 — 총 포인트 = `sum(point_events.points)`.
- `point_policies.is_active=false`인 정책은 포인트를 지급하지 않는다.
- `service_role` key는 클라이언트 번들에 절대 포함하지 않는다(`lib/supabase/admin.ts`는 서버 전용, `'server-only'` import).
- 추천 보상 중복 방지: `referrals.referred_id` UNIQUE 제약.
- 휴대폰 인증번호는 6자리, 만료 5분. 인증 완료(`profiles.phone_verified_at` not null)자만 상담예약 가능.
- 15분 무료 타이머: `consultations.started_at` 기준. 15분 경과 + `tier='free'`일 때만 결제 모달 표시.
- 관리자 API는 호출자 `profiles.role='admin'` 검증을 통과해야 한다.
- 기본값: `profiles.role='user'`, `profiles.tier='free'`.
- 메시지 채널은 `'kakao'`, 상태는 `pending|sent|failed`(기본 `pending`).

---

## Phase 1 — 스캐폴드 · DB · 인증 기반

### Task 1: 프로젝트 스캐폴드 & 환경

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `.env.local.example`, `.gitignore`, `vitest.config.ts`

**Interfaces:**
- Produces: 실행 가능한 Next.js 앱(`npm run dev`), Vitest 러너(`npm test`), Tailwind 적용.

- [ ] **Step 1: 스캐폴드 생성**

```bash
cd /Users/danymac/Desktop/AI/training/북극곰/studytutor
npx create-next-app@latest . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: 테스트/Supabase 의존성 추가**

```bash
npm install @supabase/supabase-js @supabase/ssr server-only
npm install -D vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 3: `vitest.config.ts` 작성**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', globals: true },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 4: `package.json`에 test 스크립트 추가**

`"scripts"`에 `"test": "vitest run"`, `"test:watch": "vitest"` 추가.

- [ ] **Step 5: `.env.local.example` 작성**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`.gitignore`에 `.env.local` 포함 확인.

- [ ] **Step 6: 검증**

Run: `npm run build`
Expected: 빌드 성공.
Run: `npm test`
Expected: "No test files found" 또는 0 passed (러너 정상 동작).

- [ ] **Step 7: Commit** — `git init` 필요 시 먼저 실행.

```bash
git init && git add -A && git commit -m "chore: scaffold Next.js + Tailwind + Vitest"
```

---

### Task 2: DB 마이그레이션 SQL & 시드

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rls.sql`, `supabase/migrations/0003_triggers.sql`, `supabase/seed.sql`, `README.md`(Supabase 적용 안내)

**Interfaces:**
- Produces: PRD 11장 9개 테이블, RLS 정책, 가입 트리거, point_policies 시드. 컬럼/제약은 이후 모든 태스크가 의존.

- [ ] **Step 1: `0001_init.sql` — 테이블 생성**

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  tier text not null default 'free' check (tier in ('free','paid')),
  phone text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table point_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text unique not null,
  name text not null,
  points integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  policy_key text,
  points integer not null,
  reason text,
  related_user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  code text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_id uuid not null unique references profiles(id) on delete cascade,
  referral_code text,
  created_at timestamptz not null default now()
);

create table phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table message_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  channel text not null default 'kakao',
  template_key text,
  message text,
  scheduled_at timestamptz,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  zoom_url text,
  status text not null default 'reserved'
    check (status in ('reserved','started','payment_required','paid','resumed','completed')),
  reserved_at timestamptz not null default now(),
  started_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  consultation_id uuid references consultations(id) on delete set null,
  amount integer not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','failed','canceled')),
  payment_provider text not null default 'demo',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: `0002_rls.sql` — RLS 정책**

```sql
alter table profiles enable row level security;
alter table point_events enable row level security;
alter table referral_codes enable row level security;
alter table referrals enable row level security;
alter table phone_verifications enable row level security;
alter table message_jobs enable row level security;
alter table consultations enable row level security;
alter table payments enable row level security;
alter table point_policies enable row level security;

create or replace function is_admin() returns boolean language sql security definer stable as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- 본인 또는 admin SELECT
create policy "own_or_admin_select" on profiles for select using (id = auth.uid() or is_admin());
create policy "own_or_admin_select" on point_events for select using (user_id = auth.uid() or is_admin());
create policy "own_or_admin_select" on referral_codes for select using (user_id = auth.uid() or is_admin());
create policy "own_or_admin_select" on referrals for select using (referrer_id = auth.uid() or referred_id = auth.uid() or is_admin());
create policy "own_or_admin_select" on phone_verifications for select using (user_id = auth.uid() or is_admin());
create policy "own_or_admin_select" on message_jobs for select using (user_id = auth.uid() or is_admin());
create policy "own_or_admin_select" on consultations for select using (user_id = auth.uid() or is_admin());
create policy "own_or_admin_select" on payments for select using (user_id = auth.uid() or is_admin());

-- point_policies 읽기는 전체 허용
create policy "policies_read" on point_policies for select using (true);

-- 본인 profiles UPDATE (display_name 등). role/tier 변경은 service_role API에서만 수행됨(RLS 우회).
create policy "own_update" on profiles for update using (id = auth.uid());
-- 본인 상담 INSERT/UPDATE는 API(service_role)로 처리하므로 클라 직접 쓰기 정책은 두지 않음.
```

> 참고: service_role key는 RLS를 우회하므로 INSERT/UPDATE 정책을 별도로 만들지 않아도 서버 API에서 모든 쓰기가 동작한다.

- [ ] **Step 3: `0003_triggers.sql` — 가입 트리거(profiles + referral_code 자동 생성)**

```sql
create or replace function gen_referral_code() returns text language sql as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  insert into public.referral_codes (user_id, code)
  values (new.id, gen_referral_code())
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

- [ ] **Step 4: `supabase/seed.sql` — 포인트 정책 시드**

```sql
insert into point_policies (policy_key, name, points) values
  ('signup','신규가입',1000),
  ('referral_join','추천 가입자 보상',2000),
  ('referral_inviter','추천인 보상',3000),
  ('consultation_reserved','상담예약 보상',500),
  ('payment_completed','결제완료 보상',5000)
on conflict (policy_key) do nothing;
```

- [ ] **Step 5: `README.md`에 적용 절차 작성**

Supabase 대시보드 SQL Editor에서 `0001`→`0002`→`0003`→`seed` 순서로 실행, `.env.local`에 키 입력, 관리자 지정은 `update profiles set role='admin' where email='...'` 안내, 카카오 provider 설정 단계 포함.

- [ ] **Step 6: Commit**

```bash
git add supabase README.md && git commit -m "feat: db migrations, RLS, signup trigger, seed"
```

---

### Task 3: Supabase 클라이언트 (브라우저/서버/admin)

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/types.ts`

**Interfaces:**
- Produces:
  - `createBrowserSupabase(): SupabaseClient` (anon)
  - `createServerSupabase(): SupabaseClient` (쿠키 기반, 서버 컴포넌트/Route)
  - `createAdminSupabase(): SupabaseClient` (service_role, 서버 전용)
  - 타입: `Profile`, `PointPolicy`, `PointEvent`, `Consultation` 등.

- [ ] **Step 1: `lib/types.ts` 작성** — PRD 11장 컬럼에 맞춘 TS 타입(Profile/PointPolicy/PointEvent/ReferralCode/Referral/MessageJob/Consultation/Payment).

- [ ] **Step 2: `lib/supabase/client.ts`**

```ts
'use client'
import { createBrowserClient } from '@supabase/ssr'
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: `lib/supabase/server.ts`** — `@supabase/ssr` `createServerClient` + `next/headers` cookies 사용.

- [ ] **Step 4: `lib/supabase/admin.ts`**

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

- [ ] **Step 5: 검증** — `npm run build` 성공(타입 에러 없음).

- [ ] **Step 6: Commit** — `git commit -m "feat: supabase clients + types"`

---

### Task 4: 인증 헬퍼 & 권한 가드

**Files:**
- Create: `lib/auth.ts`, `lib/auth.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase`.
- Produces:
  - `getSessionProfile(): Promise<Profile | null>`
  - `requireUser(): Promise<Profile>` (없으면 redirect '/login')
  - `requireAdmin(): Promise<Profile>` (admin 아니면 redirect '/')
  - 순수 함수 `isAdmin(profile): boolean`, `canAccessAdmin(profile): boolean`.

- [ ] **Step 1: 실패 테스트 — `lib/auth.test.ts`**

```ts
import { isAdmin, canAccessAdmin } from '@/lib/auth'
test('isAdmin true only for admin role', () => {
  expect(isAdmin({ role: 'admin' } as any)).toBe(true)
  expect(isAdmin({ role: 'user' } as any)).toBe(false)
  expect(isAdmin(null)).toBe(false)
})
test('canAccessAdmin matches isAdmin', () => {
  expect(canAccessAdmin({ role: 'admin' } as any)).toBe(true)
  expect(canAccessAdmin({ role: 'user' } as any)).toBe(false)
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run lib/auth.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 순수 함수 `isAdmin`/`canAccessAdmin` + 서버 헬퍼(`getSessionProfile`/`requireUser`/`requireAdmin`)를 `lib/auth.ts`에 작성.
- [ ] **Step 4: 통과 확인** — `npx vitest run lib/auth.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: auth helpers + role guards"`

---

### Task 5: 사이트 설정 · 레이아웃 · 네비 · 홈

**Files:**
- Create: `lib/site-config.ts`, `components/Nav.tsx`, `components/ui.tsx`(Card/Button/Badge 등 공용), `app/layout.tsx`(수정), `app/page.tsx`(홈)

**Interfaces:**
- Consumes: `getSessionProfile`.
- Produces: 공용 UI 컴포넌트, 전역 네비. `siteConfig`(serviceName, mainCopy, ctaLabel).

- [ ] **Step 1: `lib/site-config.ts`** — `{ serviceName:'코치링', tagline:'15분 무료로 시작하는 전문가 1:1 코칭', ctaLabel:'무료 상담 시작하기' }`.
- [ ] **Step 2: `components/ui.tsx`** — Tailwind 기반 Card/Button/Badge/Input. 톤: 신뢰감 있는 파랑(`bg-blue-600`), 카드(`rounded-2xl border shadow-sm`).
- [ ] **Step 3: `components/Nav.tsx`** — 로고(serviceName), 마이페이지/포인트/추천인/상담/관리자(admin만) 링크, 로그인/로그아웃.
- [ ] **Step 4: `app/layout.tsx`** — Nav 포함, 한국어 `lang="ko"`.
- [ ] **Step 5: `app/page.tsx`** — 히어로(tagline+CTA→/consultations), 가치 제안 3카드(무료15분/포인트혜택/휴대폰인증 신뢰).
- [ ] **Step 6: 검증** — `npm run dev` 후 홈 렌더 확인. `npm run build` 성공.
- [ ] **Step 7: Commit** — `git commit -m "feat: layout, nav, home, site-config"`

---

### Task 6: 로그인/회원가입 + 가입 후처리 골격 + 마이페이지 + 관리자 골격

**Files:**
- Create: `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/auth/signout/route.ts`, `app/mypage/page.tsx`, `app/admin/page.tsx`, `app/api/auth/after-signup/route.ts`(골격)

**Interfaces:**
- Consumes: supabase clients, `requireUser`, `requireAdmin`.
- Produces: 이메일/비번 가입·로그인 동작, 로그인 후 `/api/auth/after-signup` 호출(이 시점엔 포인트/메시지 미구현 — Phase 2/3에서 채움), 마이페이지(email/name/role/tier 표시), 관리자 홈(메뉴, admin 가드).

- [ ] **Step 1: `app/login/page.tsx`** — 탭(로그인/회원가입). 이메일/비번 + `signInWithPassword`/`signUp`. 카카오 버튼(`signInWithOAuth({provider:'kakao'})`)은 배치하되 미설정 시 안내. `?ref=` 쿼리를 읽어 signUp `options.data.ref` 또는 localStorage에 저장.
- [ ] **Step 2: `app/auth/callback/route.ts`** — OAuth 코드 교환 후 `/mypage`로 redirect.
- [ ] **Step 3: `app/auth/signout/route.ts`** — `signOut` 후 `/`.
- [ ] **Step 4: `app/api/auth/after-signup/route.ts`(골격)** — 인증 사용자 확인, 멱등 플래그(이미 `signup` point_event 있으면 skip) 구조만. 실제 지급은 Task 8에서 채운다. 지금은 `{ ok: true }` 반환.
- [ ] **Step 5: `app/mypage/page.tsx`** — `requireUser`로 profile 조회, email/display_name/role/tier 카드 표시. 휴대폰 인증 상태/포인트는 이후 태스크에서 추가.
- [ ] **Step 6: `app/admin/page.tsx`** — `requireAdmin`, 관리자 메뉴 링크(회원/정책/메시지/상담/결제).
- [ ] **Step 7: 검증** — 이메일 가입→로그인→마이페이지 표시, 비로그인 `/mypage`는 `/login` redirect, 비admin `/admin`은 `/` redirect.
- [ ] **Step 8: Commit** — `git commit -m "feat: auth pages, mypage, admin shell, after-signup skeleton"`

---

## Phase 2 — 포인트 · 추천 · 관리자 정책

### Task 7: 포인트 정책/지급 코어 로직 (TDD)

**Files:**
- Create: `lib/points.ts`, `lib/points.test.ts`

**Interfaces:**
- Consumes: admin supabase client(주입 가능하게 인자로 받음).
- Produces:
  - `sumPoints(events: {points:number}[]): number`
  - `async grantPoints(db, { userId, policyKey, relatedUserId?, reason? }): Promise<PointEvent|null>` — 정책 조회→`is_active`면 `point_events` insert 후 반환, 비활성/미존재면 `null`.

- [ ] **Step 1: 실패 테스트 — `lib/points.test.ts`**

```ts
import { sumPoints, grantPoints } from '@/lib/points'

test('sumPoints adds event points', () => {
  expect(sumPoints([{points:1000},{points:2000},{points:-500}])).toBe(2500)
  expect(sumPoints([])).toBe(0)
})

function fakeDb(policy: any) {
  const inserted: any[] = []
  return {
    inserted,
    from(table: string) {
      if (table === 'point_policies') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: policy }) }) })
      }
      if (table === 'point_events') return {
        insert: (row: any) => ({ select: () => ({ single: async () => { inserted.push(row); return { data: { id:'x', ...row } } } }) })
      }
    },
  } as any
}

test('grantPoints inserts when policy active', async () => {
  const db = fakeDb({ policy_key:'signup', points:1000, is_active:true, name:'신규가입' })
  const ev = await grantPoints(db, { userId:'u1', policyKey:'signup' })
  expect(ev?.points).toBe(1000)
  expect(db.inserted).toHaveLength(1)
})

test('grantPoints skips when policy inactive', async () => {
  const db = fakeDb({ policy_key:'signup', points:1000, is_active:false })
  const ev = await grantPoints(db, { userId:'u1', policyKey:'signup' })
  expect(ev).toBeNull()
  expect(db.inserted).toHaveLength(0)
})

test('grantPoints skips when policy missing', async () => {
  const db = fakeDb(null)
  const ev = await grantPoints(db, { userId:'u1', policyKey:'nope' })
  expect(ev).toBeNull()
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run lib/points.test.ts` → FAIL.
- [ ] **Step 3: 구현 `lib/points.ts`**

```ts
export function sumPoints(events: { points: number }[]): number {
  return events.reduce((s, e) => s + e.points, 0)
}

export async function grantPoints(db: any, opts: {
  userId: string; policyKey: string; relatedUserId?: string; reason?: string
}) {
  const { data: policy } = await db.from('point_policies')
    .select('*').eq('policy_key', opts.policyKey).maybeSingle()
  if (!policy || !policy.is_active) return null
  const row = {
    user_id: opts.userId, policy_key: opts.policyKey, points: policy.points,
    reason: opts.reason ?? policy.name, related_user_id: opts.relatedUserId ?? null,
  }
  const { data } = await db.from('point_events').insert(row).select().single()
  return data
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run lib/points.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: points core (sumPoints, grantPoints) with policy gating"`

---

### Task 8: 가입 후처리 완성 (신규가입+추천+메시지예약)

**Files:**
- Create: `lib/after-signup.ts`, `lib/after-signup.test.ts`
- Modify: `app/api/auth/after-signup/route.ts`

**Interfaces:**
- Consumes: `grantPoints`.
- Produces: `async runAfterSignup(db, { userId, refCode? }): Promise<{granted:string[], referred:boolean, messages:number}>` — 멱등(이미 signup 이벤트 있으면 no-op), signup 지급, refCode 유효 시 `referrals` insert + 가입자/추천인 지급(중복 referred_id면 skip), 1/3/7일 `message_jobs` 3건 생성.

- [ ] **Step 1: 실패 테스트 — `lib/after-signup.test.ts`** — fake db로: (a) 신규가입 시 signup 지급 + 메시지 3건, (b) 유효 refCode면 referral_join/referral_inviter 지급 + referrals insert, (c) 이미 signup 이벤트 있으면 전체 no-op(멱등), (d) refCode 무효면 추천 지급 없음.

```ts
import { runAfterSignup } from '@/lib/after-signup'
// fake db: point_events 존재여부, referral_codes 조회, referrals insert(unique 위반 시뮬), message_jobs insert 카운트
test('grants signup + schedules 3 messages, no ref', async () => {
  const { db } = makeDb({ existingSignup:false, refOwner:null })
  const r = await runAfterSignup(db, { userId:'u1' })
  expect(r.granted).toContain('signup')
  expect(r.messages).toBe(3)
  expect(r.referred).toBe(false)
})
test('idempotent when signup already granted', async () => {
  const { db } = makeDb({ existingSignup:true, refOwner:null })
  const r = await runAfterSignup(db, { userId:'u1' })
  expect(r.granted).toHaveLength(0)
  expect(r.messages).toBe(0)
})
test('valid refCode grants join+inviter and records referral', async () => {
  const { db, referrals } = makeDb({ existingSignup:false, refOwner:'inviter1' })
  const r = await runAfterSignup(db, { userId:'u2', refCode:'ABC123' })
  expect(r.referred).toBe(true)
  expect(r.granted).toEqual(expect.arrayContaining(['referral_join','referral_inviter']))
  expect(referrals).toHaveLength(1)
})
```

(`makeDb` 헬퍼는 테스트 파일 상단에 구현 — point_policies는 모두 active 가정, points는 PRD 시드값 반환.)

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현 `lib/after-signup.ts`** — 멱등 체크(point_events에 user_id+policy_key='signup' 존재 여부) → grantPoints('signup') → refCode 있으면 referral_codes 조회로 referrer 찾고 self가 아니면 referrals insert(실패=중복이면 추천 skip), grantPoints('referral_join' for user, 'referral_inviter' for referrer with relatedUserId) → message_jobs 3건(scheduled_at = created+1/3/7일, channel 'kakao', 템플릿 메시지 PRD 9.7 문구).
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: API Route 연결** — `app/api/auth/after-signup/route.ts`에서 인증 사용자 id + body의 refCode를 받아 `createAdminSupabase()`로 `runAfterSignup` 호출. `app/login/page.tsx`의 가입 성공 후 이 API를 호출(저장해둔 ref 전달).
- [ ] **Step 6: 검증** — 신규 이메일 가입 후 마이페이지에서(다음 태스크 표시) 포인트 1000, message_jobs 3건 생성(관리자에서 확인은 Task 11).
- [ ] **Step 7: Commit** — `git commit -m "feat: after-signup (signup/referral points + 1/3/7d messages)"`

---

### Task 9: 마이페이지 포인트 표시 + 포인트 페이지

**Files:**
- Create: `app/points/page.tsx`
- Modify: `app/mypage/page.tsx`

**Interfaces:**
- Consumes: `sumPoints`, server supabase.
- Produces: 마이페이지 총 포인트 카드, 포인트 페이지(총액 + 내역 리스트).

- [ ] **Step 1: `app/points/page.tsx`** — `requireUser` 후 본인 `point_events` 조회(RLS로 본인만), `sumPoints`로 총액, 내역 테이블(일시/사유/포인트).
- [ ] **Step 2: `app/mypage/page.tsx` 수정** — 총 포인트 카드 추가(+포인트 페이지 링크).
- [ ] **Step 3: 검증** — 가입 후 1000P 표시, 내역에 "신규가입" 행.
- [ ] **Step 4: Commit** — `git commit -m "feat: points page + mypage total points"`

---

### Task 10: 추천인 페이지

**Files:**
- Create: `app/referral/page.tsx`, `components/CopyButton.tsx`

**Interfaces:**
- Consumes: server supabase(referral_codes).
- Produces: 내 추천코드 표시, `/{SITE_URL}/login?ref=CODE` 링크 복사 버튼.

- [ ] **Step 1: `components/CopyButton.tsx`** — 클라 컴포넌트, `navigator.clipboard.writeText`, 복사됨 토스트.
- [ ] **Step 2: `app/referral/page.tsx`** — `requireUser` 후 본인 referral_codes 조회, 코드/추천링크 표시 + CopyButton.
- [ ] **Step 3: 검증** — 추천코드 노출, 복사 동작.
- [ ] **Step 4: Commit** — `git commit -m "feat: referral page with copy link"`

---

### Task 11: 관리자 — 회원 관리 + 포인트 정책 + 메시지 목록

**Files:**
- Create: `app/admin/users/page.tsx`, `app/admin/policies/page.tsx`, `app/admin/messages/page.tsx`, `app/api/admin/users/route.ts`, `app/api/admin/policies/route.ts`
- Create: `lib/admin-guard.ts`, `lib/admin-guard.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, admin supabase, `isAdmin`.
- Produces:
  - `async assertAdminRequest(serverDb): Promise<Profile>`(아니면 throw 403) — API용.
  - 회원 role/tier 수정 API(`PATCH /api/admin/users`), 정책 수정 API(`PATCH /api/admin/policies`).

- [ ] **Step 1: 실패 테스트 `lib/admin-guard.test.ts`** — `parseUserPatch`(허용 필드 role∈{user,admin}, tier∈{free,paid}만 통과, 그 외 거부) 순수 함수 테스트.

```ts
import { parseUserPatch } from '@/lib/admin-guard'
test('accepts valid role/tier', () => {
  expect(parseUserPatch({ id:'u1', role:'admin' })).toEqual({ id:'u1', role:'admin' })
  expect(parseUserPatch({ id:'u1', tier:'paid' })).toEqual({ id:'u1', tier:'paid' })
})
test('rejects invalid values', () => {
  expect(() => parseUserPatch({ id:'u1', role:'super' })).toThrow()
  expect(() => parseUserPatch({ id:'u1' })).toThrow()
})
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현 `lib/admin-guard.ts`** — `parseUserPatch`, `parsePolicyPatch`(points:int≥0, is_active:bool, name:string), `assertAdminRequest`(server supabase로 세션 profile 조회 후 role!=admin이면 throw).
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: API Routes** — `PATCH /api/admin/users`(assertAdminRequest→admin db로 profiles update), `PATCH /api/admin/policies`(정책 update + updated_at).
- [ ] **Step 6: 관리자 페이지** — users(목록+role/tier 셀렉트 저장), policies(정책 행별 name/points/is_active 편집·저장), messages(message_jobs 목록 status별 표시).
- [ ] **Step 7: 검증** — admin이 정책 points 변경→이후 가입 지급액 반영, 회원 tier 변경 반영, 메시지 목록 표시. 비admin API 호출 403.
- [ ] **Step 8: Commit** — `git commit -m "feat: admin users/policies/messages management"`

---

## Phase 3 — 카카오 로그인 · 휴대폰 인증

### Task 12: 카카오 로그인 마무리 + 문서

**Files:**
- Modify: `app/login/page.tsx`, `app/auth/callback/route.ts`, `README.md`

**Interfaces:**
- Produces: 카카오 OAuth 버튼 동작(설정 시), 콜백 후 after-signup 호출(저장된 ref 포함).

- [ ] **Step 1: 카카오 버튼** — `signInWithOAuth({ provider:'kakao', options:{ redirectTo: `${SITE_URL}/auth/callback` }})`. ref는 OAuth 전 localStorage에 저장.
- [ ] **Step 2: 콜백 처리** — `/auth/callback`에서 세션 교환 후, 신규 사용자면(profiles 방금 생성) `after-signup` 호출(localStorage ref는 클라에서 콜백 후 처리하는 작은 클라 컴포넌트로). `/mypage` redirect.
- [ ] **Step 3: README** — 카카오 개발자앱 생성, REST 키, Redirect URI(`<SUPABASE_URL>/auth/v1/callback`), Supabase Auth Kakao provider 설정 단계 기재. 미설정 시 이메일/비번으로 시연 가능 명시.
- [ ] **Step 4: 검증** — (설정된 경우) 카카오 로그인→마이페이지. 미설정이면 안내 표시.
- [ ] **Step 5: Commit** — `git commit -m "feat: kakao oauth login + setup docs"`

---

### Task 13: 휴대폰 인증 (코어 TDD + API + UI)

**Files:**
- Create: `lib/phone.ts`, `lib/phone.test.ts`, `app/api/phone/send/route.ts`, `app/api/phone/verify/route.ts`, `app/mypage/PhoneVerify.tsx`
- Modify: `app/mypage/page.tsx`

**Interfaces:**
- Produces:
  - `genCode(): string`(6자리), `expiryFrom(now: Date): Date`(+5분)
  - `verifyCode(record, input, now): { ok:boolean, reason?: 'expired'|'mismatch'|'used' }`
  - send/verify API, 마이페이지 인증 위젯.

- [ ] **Step 1: 실패 테스트 `lib/phone.test.ts`**

```ts
import { genCode, expiryFrom, verifyCode } from '@/lib/phone'
test('genCode is 6 digits', () => { expect(genCode()).toMatch(/^\d{6}$/) })
test('expiryFrom adds 5 minutes', () => {
  const now = new Date('2026-06-26T00:00:00Z')
  expect(expiryFrom(now).toISOString()).toBe('2026-06-26T00:05:00.000Z')
})
test('verifyCode ok within expiry and matching', () => {
  const now = new Date('2026-06-26T00:01:00Z')
  expect(verifyCode({ code:'123456', expires_at:'2026-06-26T00:05:00Z', verified_at:null }, '123456', now)).toEqual({ ok:true })
})
test('verifyCode expired', () => {
  const now = new Date('2026-06-26T00:06:00Z')
  expect(verifyCode({ code:'123456', expires_at:'2026-06-26T00:05:00Z', verified_at:null }, '123456', now).reason).toBe('expired')
})
test('verifyCode mismatch', () => {
  const now = new Date('2026-06-26T00:01:00Z')
  expect(verifyCode({ code:'123456', expires_at:'2026-06-26T00:05:00Z', verified_at:null }, '000000', now).reason).toBe('mismatch')
})
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현 `lib/phone.ts`** — genCode(`String(Math.floor(100000+Math.random()*900000))`), expiryFrom, verifyCode(used→reason 'used', expired, mismatch, else ok).
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: `POST /api/phone/send`** — 인증 사용자, body.phone. genCode+expiryFrom로 phone_verifications insert. **개발단계: 응답 `{ devCode }` + `console.log`로 코드 노출.**
- [ ] **Step 6: `POST /api/phone/verify`** — 최신 미사용 인증행 조회 → verifyCode → ok면 verified_at 갱신 + `profiles.phone_verified_at=now()`, phone 저장.
- [ ] **Step 7: `app/mypage/PhoneVerify.tsx`** — 번호 입력→전송(devCode 화면 표시)→코드 입력→검증. 완료 시 "인증완료" 배지.
- [ ] **Step 8: 마이페이지에 위젯 + 인증상태 표시**.
- [ ] **Step 9: 검증** — 인증 흐름 성공→phone_verified_at 저장. 만료/오류 메시지.
- [ ] **Step 10: Commit** — `git commit -m "feat: phone verification (code gen/verify, send/verify API, UI)"`

---

## Phase 4 — 상담 · 15분 타이머 · 데모 결제

### Task 14: 상담예약 (가드 + 생성 API + 목록)

**Files:**
- Create: `lib/consultation.ts`, `lib/consultation.test.ts`, `app/api/consultations/route.ts`, `app/api/consultations/[id]/start/route.ts`, `app/consultations/page.tsx`
- Modify: nav.

**Interfaces:**
- Consumes: `grantPoints`, phone 인증 상태.
- Produces:
  - `canReserve(profile): boolean`(phone_verified_at not null)
  - `DEMO_ZOOM_URL` 상수
  - 상담 생성 API(인증 가드 + consultation_reserved 포인트), start API(started_at/status).

- [ ] **Step 1: 실패 테스트 `lib/consultation.test.ts`**

```ts
import { canReserve } from '@/lib/consultation'
test('canReserve requires phone verified', () => {
  expect(canReserve({ phone_verified_at:'2026-06-26T00:00:00Z' } as any)).toBe(true)
  expect(canReserve({ phone_verified_at:null } as any)).toBe(false)
})
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현 `lib/consultation.ts`** — `canReserve`, `DEMO_ZOOM_URL='https://zoom.us/j/DEMO-COACHRING'`.
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: `POST /api/consultations`** — 인증 사용자 profile 조회→`canReserve` 아니면 403→consultations insert(zoom_url=DEMO, status reserved)→grantPoints('consultation_reserved').
- [ ] **Step 6: `POST /api/consultations/[id]/start`** — 소유 검증→started_at=now(), status='started'.
- [ ] **Step 7: `app/consultations/page.tsx`** — 인증 안됐으면 안내+마이페이지 링크(예약 버튼 비활성). 예약 버튼→API→목록. 각 상담 "상담 시작" 링크→`/consultations/[id]`.
- [ ] **Step 8: 검증** — 미인증 예약 불가, 인증 후 예약 생성+500P, 목록 표시.
- [ ] **Step 9: Commit** — `git commit -m "feat: consultation reserve/start with phone gate + reserve points"`

---

### Task 15: 상담 진행 — 15분 타이머 + 결제 유도 모달 + 데모 결제

**Files:**
- Create: `lib/timer.ts`, `lib/timer.test.ts`, `app/consultations/[id]/page.tsx`, `app/consultations/[id]/Room.tsx`, `app/api/payments/demo/route.ts`, `lib/payment.ts`, `lib/payment.test.ts`

**Interfaces:**
- Consumes: `grantPoints`, consultation/profile.
- Produces:
  - `elapsedSeconds(startedAt, now): number`, `isFreeExpired(startedAt, now): boolean`(≥15분)
  - `shouldShowPaywall(profile, startedAt, now): boolean`(free && isFreeExpired)
  - `async runDemoPayment(db, { userId, consultationId }): Promise<{tier:'paid'}>` — payments insert(provider demo, status paid) + profiles tier=paid + consultation status paid→resumed + grantPoints('payment_completed').

- [ ] **Step 1: 실패 테스트 `lib/timer.test.ts`**

```ts
import { elapsedSeconds, isFreeExpired, shouldShowPaywall } from '@/lib/timer'
const start = '2026-06-26T00:00:00Z'
test('elapsed', () => {
  expect(elapsedSeconds(start, new Date('2026-06-26T00:01:00Z'))).toBe(60)
})
test('free expires at 15 min', () => {
  expect(isFreeExpired(start, new Date('2026-06-26T00:14:59Z'))).toBe(false)
  expect(isFreeExpired(start, new Date('2026-06-26T00:15:00Z'))).toBe(true)
})
test('paywall only for free after 15min', () => {
  const after = new Date('2026-06-26T00:16:00Z')
  expect(shouldShowPaywall({ tier:'free' } as any, start, after)).toBe(true)
  expect(shouldShowPaywall({ tier:'paid' } as any, start, after)).toBe(false)
  expect(shouldShowPaywall({ tier:'free' } as any, start, new Date('2026-06-26T00:05:00Z'))).toBe(false)
})
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현 `lib/timer.ts`** — 위 3개 함수(15*60=900초 기준).
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: 실패 테스트 `lib/payment.test.ts`** — fake db로 runDemoPayment가 payments insert + profiles tier=paid update + consultation status='resumed' + grantPoints('payment_completed') 호출하는지 검증.
- [ ] **Step 6: 실패 확인 → 구현 `lib/payment.ts` → 통과 확인.**
- [ ] **Step 7: `app/consultations/[id]/Room.tsx`(클라)** — started_at 기준 1초 틱 타이머 표시, Zoom 링크 버튼. `shouldShowPaywall`이면 결제 유도 모달(데모 결제 버튼)→`/api/payments/demo`→성공 시 tier=paid 반영(refresh), 모달 숨김 + "상담 계속하기". paid 회원은 모달 없음.
- [ ] **Step 8: `app/consultations/[id]/page.tsx`(서버)** — 소유 검증, 미시작이면 start 호출 유도, profile+consultation을 Room에 전달.
- [ ] **Step 9: `POST /api/payments/demo`** — 인증+소유 검증→`runDemoPayment`.
- [ ] **Step 10: 검증** — 상담 시작→타이머 작동→15분 후(테스트 위해 임계값 확인) free에 모달→데모결제→paid 전환+5000P, 모달 사라짐. paid 재방문 시 모달 없음.
- [ ] **Step 11: Commit** — `git commit -m "feat: 15min timer, paywall modal, demo payment -> paid"`

---

### Task 16: 관리자 — 상담/결제 조회 + 최종 점검

**Files:**
- Create: `app/admin/consultations/page.tsx`, `app/admin/payments/page.tsx`
- Modify: `app/admin/page.tsx`(링크), `README.md`(실행/시연 가이드)

**Interfaces:**
- Consumes: `requireAdmin`, admin supabase.
- Produces: 상담 목록/상태, 결제 내역 조회 화면.

- [ ] **Step 1: `app/admin/consultations/page.tsx`** — 전체 consultations(user/status/시각) 표.
- [ ] **Step 2: `app/admin/payments/page.tsx`** — 전체 payments(user/amount/status/provider) 표.
- [ ] **Step 3: `README.md` 시연 시나리오** — 가입→포인트→추천→인증→예약→상담→결제 전체 데모 순서, 관리자 지정 SQL, devCode 위치.
- [ ] **Step 4: 전체 검증** — `npm test`(전 테스트 통과), `npm run build`(성공), 수동 E2E 시나리오 1회.
- [ ] **Step 5: Commit** — `git commit -m "feat: admin consultations/payments view + docs; finalize MVP"`

---

## Self-Review (spec coverage)

- 웹 MVP 기본/홈/로그인/마이페이지/관리자 → Task 1,5,6 ✓
- profiles role/tier 기본값 → Task 2 트리거 ✓
- point_policies(하드코딩 금지)·관리자 수정 → Task 2,7,11 ✓
- point_events 합계 조회 → Task 7,9 ✓
- 추천코드/추천 가입 포인트/중복방지 → Task 2(unique),8,10 ✓
- 카카오 로그인 구조/구현 → Task 6,12 ✓
- 1/3/7일 메시지 예약 → Task 8, 조회 Task 11 ✓
- 휴대폰 인증(6자리·5분·devCode) → Task 13 ✓
- 상담예약·Zoom·인증가드 → Task 14 ✓
- 15분 타이머·결제모달 → Task 15 ✓
- 데모 결제·유료 전환·버튼 숨김 → Task 15 ✓
- 관리자 회원/정책/메시지/상담/결제 → Task 11,16 ✓
- 보안(service_role 서버전용, admin 가드, RLS, 본인 포인트만) → Task 2,3,4,11 ✓
- Expo/AdMob → 범위 외(후속), 설계 문서에 명시 ✓

미흡 없음. 타입/함수명 교차 일치 확인 완료(grantPoints/sumPoints/canReserve/shouldShowPaywall/runDemoPayment/runAfterSignup).
