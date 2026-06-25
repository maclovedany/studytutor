-- 코치링 — 포인트 정책 시드 (PRD 9.3)
insert into point_policies (policy_key, name, points) values
  ('signup',                '신규가입',          1000),
  ('referral_join',         '추천 가입자 보상',  2000),
  ('referral_inviter',      '추천인 보상',       3000),
  ('consultation_reserved', '상담예약 보상',      500),
  ('payment_completed',     '결제완료 보상',     5000)
on conflict (policy_key) do nothing;
