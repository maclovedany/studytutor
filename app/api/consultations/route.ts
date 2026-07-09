import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { canReserve, DEMO_ZOOM_URL } from "@/lib/consultation";
import { isZoomConfigured, createZoomMeeting } from "@/lib/zoom";
import { grantPoints } from "@/lib/points";
import type { Profile } from "@/lib/types";

/** 상담 예약 생성 — 휴대폰 인증 완료 회원만. 예약 시 상담예약 포인트 지급. */
export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!canReserve(profile as Profile | null)) {
    return NextResponse.json(
      { error: "휴대폰 인증을 먼저 완료해 주세요." },
      { status: 403 }
    );
  }

  // Zoom 설정 시 실제 미팅 생성(임베드용). 실패해도 예약은 데모 링크로 진행.
  let zoomFields: {
    zoom_url: string;
    zoom_meeting_id?: string;
    zoom_password?: string;
  } = { zoom_url: DEMO_ZOOM_URL };
  if (isZoomConfigured()) {
    try {
      const meeting = await createZoomMeeting("코치링 상담");
      zoomFields = {
        zoom_url: meeting.joinUrl,
        zoom_meeting_id: meeting.id,
        zoom_password: meeting.password,
      };
    } catch (e) {
      console.warn("[코치링] Zoom 미팅 생성 실패 — 데모 링크로 폴백:", e);
    }
  }

  const { data: consultation, error } = await admin
    .from("consultations")
    .insert({ user_id: user.id, ...zoomFields, status: "reserved" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await grantPoints(admin, { userId: user.id, policyKey: "consultation_reserved" });

  return NextResponse.json({ ok: true, consultation });
}
