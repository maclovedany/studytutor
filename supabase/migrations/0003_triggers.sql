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
