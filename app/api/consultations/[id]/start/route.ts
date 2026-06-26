import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** 상담 시작 — started_at 기록, status=started. 본인 상담만. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminSupabase();
  const { data: consultation } = await admin
    .from("consultations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!consultation || consultation.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 이미 시작했으면 기존 started_at 유지
  if (!consultation.started_at) {
    const { error } = await admin
      .from("consultations")
      .update({ started_at: new Date().toISOString(), status: "started" })
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
