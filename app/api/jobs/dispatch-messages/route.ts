import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { formatDemoLog } from "@/lib/dispatch";
import type { MessageJob } from "@/lib/types";

/**
 * 예약 메시지 발송 워커 (데모).
 *
 * 인증: `x-cron-secret` 헤더(스케줄러) 또는 관리자 세션(관리자 화면 버튼) 둘 중 하나.
 * 픽업: `pending` 이고 `scheduled_at <= now()` 인 건을 원자적 UPDATE(pending→sent) +
 *       RETURNING 으로 선점한다 → 동시 호출에도 같은 건이 두 번 발송되지 않는다.
 * 발송: 실제 전송 대신 콘솔 목업("발송했다 치고"). 상용화 시 이 목업만 Solapi 실발송으로 교체.
 */
export async function POST(request: Request) {
  // 1) 인증 — 크론 시크릿 또는 관리자 세션
  const cronSecret = process.env.CRON_SECRET;
  const viaCron =
    Boolean(cronSecret) && request.headers.get("x-cron-secret") === cronSecret;

  if (!viaCron) {
    const profile = await getSessionProfile();
    if (!isAdmin(profile)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "service_role 미설정으로 발송할 수 없습니다." },
      { status: 503 }
    );
  }

  const admin = createAdminSupabase();
  const nowIso = new Date().toISOString();

  // 2) 원자적 선점: 발송 시점이 된 pending 을 sent 로 UPDATE 하고 그 행만 돌려받는다.
  //    (scheduled_at 이 null 인 건은 lte 비교에서 제외되어 발송되지 않는다.)
  const { data, error } = await admin
    .from("message_jobs")
    .update({ status: "sent", sent_at: nowIso })
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs = (data as MessageJob[]) ?? [];

  // 3) 데모 발송 — 실제 전송 대신 콘솔 로그. (상용화 시 여기만 Solapi 호출로 교체)
  for (const job of jobs) {
    console.log(formatDemoLog(job));
  }

  return NextResponse.json({ ok: true, sent: jobs.length });
}
