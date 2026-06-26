-- 코치링 통합 셋업 SQL — Supabase SQL Editor에 통째로 붙여넣고 Run 하세요.
-- (순서: 테이블 → RLS → 트리거 → 시드)

-- ===== 0001_init =====
-- 코치링(Coachring) — 초기 스키마 (PRD 11장)
-- 실행 순서: 0001_init -> 0002_rls -> 0003_triggers -> seed

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  tier text not null default 'free' check (tier in ('free','paid')),
  phone text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists point_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text unique not null,
  name text not null,
  points integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  policy_key text,
  points integer not null,
  reason text,
  related_user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  code text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_id uuid not null unique references profiles(id) on delete cascade,
  referral_code text,
  created_at timestamptz not null default now()
);

create table if not exists phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists message_jobs (
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

create table if not exists consultations (
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

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  consultation_id uuid references consultations(id) on delete set null,
  amount integer not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','failed','canceled')),
  payment_provider text not null default 'demo',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 조회 성능용 인덱스
create index if not exists idx_point_events_user on point_events(user_id);
create index if not exists idx_consultations_user on consultations(user_id);
create index if not exists idx_message_jobs_user on message_jobs(user_id);
create index if not exists idx_payments_user on payments(user_id);

-- ===== 0002_rls =====
-- 코치링 — RLS 정책
-- 원칙:
--  * 사용자는 본인 행만 SELECT, 관리자(admin)는 전체 SELECT.
--  * 모든 쓰기(포인트 지급, tier 변경, 정책 수정, 상담 생성 등)는
--    service_role key를 쓰는 서버 API에서만 수행한다. service_role은 RLS를
--    우회하므로 별도 INSERT/UPDATE 정책을 만들지 않는다.

alter table profiles enable row level security;
alter table point_policies enable row level security;
alter table point_events enable row level security;
alter table referral_codes enable row level security;
alter table referrals enable row level security;
alter table phone_verifications enable row level security;
alter table message_jobs enable row level security;
alter table consultations enable row level security;
alter table payments enable row level security;

-- 관리자 판별 헬퍼 (RLS 재귀 방지를 위해 security definer)
create or replace function is_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles: 본인 또는 admin SELECT, 본인 UPDATE(표시 이름 등)
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select using (id = auth.uid() or is_admin());
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles
  for update using (id = auth.uid());

-- point_policies: 읽기는 전체 허용 (정책 수치 노출), 수정은 서버 API
drop policy if exists "policies_read" on point_policies;
create policy "policies_read" on point_policies
  for select using (true);

-- 나머지: 본인 또는 admin SELECT
drop policy if exists "point_events_select" on point_events;
create policy "point_events_select" on point_events
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists "referral_codes_select" on referral_codes;
create policy "referral_codes_select" on referral_codes
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists "referrals_select" on referrals;
create policy "referrals_select" on referrals
  for select using (referrer_id = auth.uid() or referred_id = auth.uid() or is_admin());

drop policy if exists "phone_verifications_select" on phone_verifications;
create policy "phone_verifications_select" on phone_verifications
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists "message_jobs_select" on message_jobs;
create policy "message_jobs_select" on message_jobs
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists "consultations_select" on consultations;
create policy "consultations_select" on consultations
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists "payments_select" on payments;
create policy "payments_select" on payments
  for select using (user_id = auth.uid() or is_admin());

-- ===== 0003_triggers =====
-- 코치링 — 가입 트리거
-- auth.users 에 새 사용자가 생기면 profiles + referral_codes 를 자동 생성한다.
-- 포인트 지급/메시지 예약은 서버 API(after-signup)에서 처리한다.

create or replace function gen_referral_code() returns text
language sql
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1))
  )
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

-- ===== seed =====
-- 코치링 — 포인트 정책 시드 (PRD 9.3)
insert into point_policies (policy_key, name, points) values
  ('signup',                '신규가입',          1000),
  ('referral_join',         '추천 가입자 보상',  2000),
  ('referral_inviter',      '추천인 보상',       3000),
  ('consultation_reserved', '상담예약 보상',      500),
  ('payment_completed',     '결제완료 보상',     5000)
on conflict (policy_key) do nothing;
