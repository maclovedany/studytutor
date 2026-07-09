import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { runDemoPayment } from "@/lib/payment";
import { dispatchDueMessages } from "@/lib/dispatch";

/** 데모 결제 — 본인 상담에 대해서만. 성공 시 유료회원(paid) 전환. */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let consultationId: string | undefined;
  try {
    consultationId = (await request.json())?.consultationId;
  } catch {
    consultationId = undefined;
  }
  if (!consultationId) {
    return NextResponse.json({ error: "consultationId 필요" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: consultation } = await admin
    .from("consultations")
    .select("id, user_id")
    .eq("id", consultationId)
    .maybeSingle();

  if (!consultation || consultation.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await runDemoPayment(admin, {
    userId: user.id,
    consultationId,
  });

  // 결제 즉시 발송분(purchase_thanks) flush — 실패해도 결제 응답은 성공 처리
  try {
    await dispatchDueMessages(admin);
  } catch (e) {
    console.error("[코치링] 결제 즉시 발송 실패:", e);
  }

  return NextResponse.json({ ok: true, ...result });
}
