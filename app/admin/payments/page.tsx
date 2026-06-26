import { requireAdmin } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import type { Payment, PaymentStatus } from "@/lib/types";

const tone: Record<PaymentStatus, "amber" | "green" | "red" | "slate"> = {
  pending: "amber",
  paid: "green",
  failed: "red",
  canceled: "slate",
};

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });
  const payments = (data as Payment[]) ?? [];

  return (
    <div>
      <PageHeader title="결제 내역 조회" desc="데모/실 결제 내역입니다." />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="pb-2">회원</th>
              <th className="pb-2">금액</th>
              <th className="pb-2">수단</th>
              <th className="pb-2">상태</th>
              <th className="pb-2">결제 시각</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">
                  {p.user_id.slice(0, 8)}
                </td>
                <td className="py-2 pr-3 font-medium text-slate-800">
                  ₩{p.amount.toLocaleString()}
                </td>
                <td className="py-2 pr-3">{p.payment_provider}</td>
                <td className="py-2 pr-3">
                  <Badge tone={tone[p.status]}>{p.status}</Badge>
                </td>
                <td className="py-2 text-slate-500">
                  {p.paid_at
                    ? new Date(p.paid_at).toLocaleString("ko-KR")
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            결제 내역이 없습니다.
          </p>
        )}
      </Card>
    </div>
  );
}
