import { requireAdmin } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import {
  consultationStatusLabel,
  consultationStatusTone,
} from "@/lib/consultation-status";
import type { Consultation } from "@/lib/types";

export default async function AdminConsultationsPage() {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("consultations")
    .select("*")
    .order("created_at", { ascending: false });
  const consultations = (data as Consultation[]) ?? [];

  return (
    <div>
      <PageHeader title="상담 예약 조회" desc="전체 상담 예약과 진행 상태입니다." />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="pb-2">상담 ID</th>
              <th className="pb-2">회원</th>
              <th className="pb-2">상태</th>
              <th className="pb-2">예약</th>
              <th className="pb-2">시작</th>
            </tr>
          </thead>
          <tbody>
            {consultations.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-mono text-xs text-slate-400">
                  {c.id.slice(0, 8)}
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">
                  {c.user_id.slice(0, 8)}
                </td>
                <td className="py-2 pr-3">
                  <Badge tone={consultationStatusTone[c.status]}>
                    {consultationStatusLabel[c.status]}
                  </Badge>
                </td>
                <td className="py-2 pr-3 text-slate-500">
                  {new Date(c.reserved_at).toLocaleString("ko-KR")}
                </td>
                <td className="py-2 text-slate-500">
                  {c.started_at
                    ? new Date(c.started_at).toLocaleString("ko-KR")
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {consultations.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            상담 예약이 없습니다.
          </p>
        )}
      </Card>
    </div>
  );
}
