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
