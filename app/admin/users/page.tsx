import { requireAdmin } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import type { Profile } from "@/lib/types";
import UserRow from "./UserRow";

export default async function AdminUsersPage() {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  const users = (data as Profile[]) ?? [];

  return (
    <div>
      <PageHeader title="회원 관리" desc="회원의 권한(role)과 등급(tier)을 변경합니다." />
      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="pb-2">회원</th>
              <th className="pb-2">권한</th>
              <th className="pb-2">등급</th>
              <th className="pb-2 text-right">저장</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">회원이 없습니다.</p>
        )}
      </Card>
    </div>
  );
}
