import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { canReserve } from "@/lib/consultation";
import {
  consultationStatusLabel,
  consultationStatusTone,
} from "@/lib/consultation-status";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import type { Consultation } from "@/lib/types";
import ReserveButton from "./ReserveButton";

export default async function ConsultationsPage() {
  const profile = await requireUser();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("consultations")
    .select("*")
    .order("created_at", { ascending: false });
  const consultations = (data as Consultation[]) ?? [];
  const verified = canReserve(profile);

  return (
    <div>
      <PageHeader title="상담 예약" desc="전문가와 15분 무료 상담을 시작해 보세요." />

      <Card className="mb-6">
        {verified ? (
          <ReserveButton disabled={false} />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-700">
              상담 예약은 휴대폰 인증을 완료한 회원만 가능합니다.
            </p>
            <ButtonLink href="/mypage" variant="secondary">
              휴대폰 인증하러 가기
            </ButtonLink>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {consultations.map((c) => (
          <Card key={c.id} className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">상담</span>
                <Badge tone={consultationStatusTone[c.status]}>
                  {consultationStatusLabel[c.status]}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                예약: {new Date(c.reserved_at).toLocaleString("ko-KR")}
              </p>
            </div>
            <Link
              href={`/consultations/${c.id}`}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {c.status === "reserved" ? "상담 시작" : "상담 입장"}
            </Link>
          </Card>
        ))}
        {consultations.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            아직 예약한 상담이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
