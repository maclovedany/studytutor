import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isZoomConfigured, generateSdkSignature } from "@/lib/zoom";
import { shouldShowPaywall } from "@/lib/timer";
import type { Tier } from "@/lib/types";

/**
 * Meeting SDK 입장 서명 발급 — 본인 상담만.
 * 서버 강제 게이트: 무료회원 & 15분 경과 & 미결제면 403(payment_required)
 * → 결제 모달을 새로고침으로 우회할 수 없다. 클라이언트 타이머와 같은
 *   shouldShowPaywall 을 쓰므로 판정 기준이 일치한다.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isZoomConfigured()) {
    return NextResponse.json({ error: "zoom_not_configured" }, { status: 503 });
  }

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
    .select("id, user_id, zoom_meeting_id, zoom_password, started_at")
    .eq("id", consultationId)
    .maybeSingle();
  if (!consultation || consultation.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!consultation.zoom_meeting_id) {
    return NextResponse.json(
      { error: "임베드 미지원 상담(데모 링크 전용)" },
      { status: 400 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("tier, display_name")
    .eq("id", user.id)
    .maybeSingle();
  const tier: Tier = (profile?.tier as Tier) ?? "free";

  if (shouldShowPaywall({ tier }, consultation.started_at, new Date())) {
    return NextResponse.json({ error: "payment_required" }, { status: 403 });
  }

  const signature = generateSdkSignature({
    meetingNumber: consultation.zoom_meeting_id,
    role: 0,
  });
  return NextResponse.json({
    ok: true,
    signature,
    meetingNumber: consultation.zoom_meeting_id,
    password: consultation.zoom_password ?? "",
    userName: profile?.display_name ?? "회원",
  });
}
