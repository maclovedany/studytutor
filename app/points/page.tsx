import { requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { sumPoints } from "@/lib/points";
import { Card, PageHeader } from "@/components/ui";
import type { PointEvent } from "@/lib/types";

export default async function PointsPage() {
  await requireUser();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("point_events")
    .select("*")
    .order("created_at", { ascending: false });

  const events = (data as PointEvent[]) ?? [];
  const total = sumPoints(events);

  return (
    <div>
      <PageHeader title="포인트" desc="적립·차감 내역과 총 보유 포인트입니다." />

      <Card className="mb-6 bg-gradient-to-br from-blue-600 to-blue-500 text-white">
        <p className="text-sm text-blue-100">총 보유 포인트</p>
        <p className="mt-1 text-4xl font-extrabold">
          {total.toLocaleString()} <span className="text-2xl">P</span>
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">포인트 내역</h2>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            아직 포인트 내역이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {e.reason ?? e.policy_key ?? "포인트"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(e.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ${e.points >= 0 ? "text-blue-600" : "text-red-500"}`}
                >
                  {e.points >= 0 ? "+" : ""}
                  {e.points.toLocaleString()} P
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
