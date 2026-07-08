import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { formatDemoLog } from "@/lib/dispatch";
import { isSolapiConfigured, sendViaSolapi } from "@/lib/solapi";
import type { MessageJob } from "@/lib/types";

/**
 * 예약 메시지 발송 워커.
 *
 * 인증: `x-cron-secret` 헤더(스케줄러) 또는 관리자 세션(관리자 화면 버튼).
 * 선점: `pending` & `scheduled_at<=now()` 를 원자적 UPDATE(pending→sent)+RETURNING 으로
 *       확보한다 → 동시 호출에도 중복발송되지 않는다.
 * 발송: Solapi 설정 시 실발송(알림톡/SMS), 미설정 시 콘솔 데모. 실발송 실패 건은 failed 로 정정.
 *       수신 번호(profiles.phone)가 없는 회원은 failed 로 기록하고 건너뛴다.
 */
export async function POST(request: Request) {
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

  // 1) 선점: 발송 시점이 된 pending 을 sent 로 UPDATE 하고 그 행만 돌려받는다.
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
  if (jobs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0 });
  }

  // 2) Solapi 미설정 → 데모 폴백(콘솔 로그, 이미 sent 로 선점됨)
  if (!isSolapiConfigured()) {
    for (const job of jobs) console.log(formatDemoLog(job));
    return NextResponse.json({
      ok: true,
      mode: "demo",
      sent: jobs.length,
      failed: 0,
    });
  }

  // 3) 실발송 — 수신 번호 조회
  const userIds = [...new Set(jobs.map((j) => j.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, phone, display_name")
    .in("id", userIds);
  const phoneOf = new Map<string, string | null>(
    (profiles ?? []).map((p) => [p.id as string, (p.phone as string | null) ?? null])
  );

  const markFailed = async (id: string, reason: string) => {
    await admin
      .from("message_jobs")
      .update({ status: "failed", sent_at: null })
      .eq("id", id);
    console.warn(`[코치링][발송실패] job=${id}: ${reason}`);
  };

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    const phone = phoneOf.get(job.user_id);
    if (!phone) {
      await markFailed(job.id, "수신 번호 없음(휴대폰 미인증)");
      failed++;
      continue;
    }
    try {
      await sendViaSolapi({
        to: phone,
        text: job.message ?? "",
        templateKey: job.template_key,
      });
      sent++;
    } catch (e) {
      await markFailed(job.id, e instanceof Error ? e.message : "발송 오류");
      failed++;
    }
  }

  return NextResponse.json({ ok: true, mode: "real", sent, failed });
}
