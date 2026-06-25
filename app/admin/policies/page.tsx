import { requireAdmin } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import type { PointPolicy } from "@/lib/types";
import PolicyRow from "./PolicyRow";

export default async function AdminPoliciesPage() {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("point_policies")
    .select("*")
    .order("created_at", { ascending: true });
  const policies = (data as PointPolicy[]) ?? [];

  return (
    <div>
      <PageHeader
        title="포인트 정책"
        desc="지급 포인트와 활성화 여부를 수정합니다. 비활성 정책은 포인트를 지급하지 않습니다."
      />
      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="pb-2">정책 키</th>
              <th className="pb-2">이름</th>
              <th className="pb-2">포인트</th>
              <th className="pb-2">활성</th>
              <th className="pb-2 text-right">저장</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <PolicyRow key={p.id} policy={p} />
            ))}
          </tbody>
        </table>
        {policies.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            정책이 없습니다. seed.sql을 실행했는지 확인하세요.
          </p>
        )}
      </Card>
    </div>
  );
}
