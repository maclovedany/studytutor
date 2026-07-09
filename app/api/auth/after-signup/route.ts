import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/ensure-profile";
import { runAfterSignup } from "@/lib/after-signup";
import { dispatchDueMessages } from "@/lib/dispatch";

/**
 * 가입 후처리 — 로그인 직후 클라이언트가 호출(멱등).
 * 신규가입/추천 포인트 지급, 1/3/7일 메시지 예약 생성을 서버에서 수행한다.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let refCode: string | null = null;
  try {
    const body = await request.json();
    refCode = body?.refCode ?? null;
  } catch {
    refCode = null;
  }

  const admin = createAdminSupabase();
  // 포인트 지급은 profiles FK에 의존하므로 먼저 프로필을 보장한다.
  await ensureProfile(user);
  const result = await runAfterSignup(admin, { userId: user.id, refCode });

  // 가입 즉시 발송분 flush — 실패해도 가입 응답은 성공 처리
  try {
    await dispatchDueMessages(admin);
  } catch (e) {
    console.error("[코치링] 가입 즉시 발송 실패:", e);
  }

  return NextResponse.json({ ok: true, ...result });
}
