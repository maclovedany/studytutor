import { requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { sumPoints } from "@/lib/points";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import type { PointEvent } from "@/lib/types";

export default async function MyPage() {
  const profile = await requireUser();
  const supabase = await createServerSupabase();
  const { data: events } = await supabase.from("point_events").select("points");
  const totalPoints = sumPoints((events as Pick<PointEvent, "points">[]) ?? []);

  return (
    <div>
      <PageHeader title="마이페이지" desc="회원 정보와 상태를 확인하세요." />

      <Card className="mb-4 flex items-center justify-between bg-gradient-to-br from-blue-600 to-blue-500 text-white">
        <div>
          <p className="text-sm text-blue-100">총 보유 포인트</p>
          <p className="mt-1 text-3xl font-extrabold">
            {totalPoints.toLocaleString()} <span className="text-xl">P</span>
          </p>
        </div>
        <ButtonLink href="/points" variant="secondary" className="bg-white/95">
          내역 보기
        </ButtonLink>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-slate-500">회원 정보</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="이름" value={profile.display_name ?? "-"} />
            <Row label="이메일" value={profile.email ?? "-"} />
            <Row
              label="권한"
              value={
                <Badge tone={profile.role === "admin" ? "blue" : "slate"}>
                  {profile.role === "admin" ? "관리자" : "일반"}
                </Badge>
              }
            />
            <Row
              label="등급"
              value={
                <Badge tone={profile.tier === "paid" ? "green" : "slate"}>
                  {profile.tier === "paid" ? "유료회원" : "무료회원"}
                </Badge>
              }
            />
            <Row
              label="휴대폰 인증"
              value={
                profile.phone_verified_at ? (
                  <Badge tone="green">인증완료</Badge>
                ) : (
                  <Badge tone="amber">미인증</Badge>
                )
              }
            />
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-slate-500">바로가기</h2>
          <div className="mt-3 flex flex-col gap-2">
            <ButtonLink href="/points" variant="secondary">
              포인트 내역 보기
            </ButtonLink>
            <ButtonLink href="/referral" variant="secondary">
              추천 코드 / 링크
            </ButtonLink>
            <ButtonLink href="/consultations" variant="primary">
              상담 예약하기
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
