import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { dispatchDueMessages } from "@/lib/dispatch";

/**
 * 예약 메시지 발송 워커.
 * 인증: `x-cron-secret` 헤더(스케줄러) 또는 관리자 세션(관리자 화면 버튼).
 * 발송 로직은 lib/dispatch.dispatchDueMessages 로 위임(가입/결제 인라인 트리거와 공용).
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

  try {
    const admin = createAdminSupabase();
    const result = await dispatchDueMessages(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "발송 처리 오류" },
      { status: 500 }
    );
  }
}
