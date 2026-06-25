import { requireAdmin } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import type { MessageJob, MessageStatus } from "@/lib/types";

const statusTone: Record<MessageStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  sent: "green",
  failed: "red",
};

export default async function AdminMessagesPage() {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("message_jobs")
    .select("*")
    .order("scheduled_at", { ascending: true });
  const jobs = (data as MessageJob[]) ?? [];

  return (
    <div>
      <PageHeader
        title="메시지 예약"
        desc="가입 후 1/3/7일 자동 메시지 예약 목록입니다. (실제 발송은 MVP 범위 밖)"
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="pb-2">예정 시각</th>
              <th className="pb-2">채널</th>
              <th className="pb-2">메시지</th>
              <th className="pb-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 text-slate-500">
                  {j.scheduled_at
                    ? new Date(j.scheduled_at).toLocaleString("ko-KR")
                    : "-"}
                </td>
                <td className="py-2 pr-3">{j.channel}</td>
                <td className="py-2 pr-3 text-slate-700">{j.message}</td>
                <td className="py-2">
                  <Badge tone={statusTone[j.status]}>{j.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            예약된 메시지가 없습니다.
          </p>
        )}
      </Card>
    </div>
  );
}
