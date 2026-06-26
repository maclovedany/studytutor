import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { canReserve, DEMO_ZOOM_URL } from "@/lib/consultation";
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

  const { data: consultation, error } = await admin
    .from("consultations")
    .insert({ user_id: user.id, zoom_url: DEMO_ZOOM_URL, status: "reserved" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await grantPoints(admin, { userId: user.id, policyKey: "consultation_reserved" });

  return NextResponse.json({ ok: true, consultation });
}
