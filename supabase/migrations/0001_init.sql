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
