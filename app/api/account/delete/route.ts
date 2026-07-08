import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * 회원 탈퇴 — 로그인된 "본인"만 삭제한다(body의 id 등 외부 입력을 절대 신뢰하지 않음).
 * auth.users 삭제 → profiles 및 전 연관 테이블이 on delete cascade 로 연쇄 삭제된다.
 */
export async function POST() {
  // Auth 유저 삭제는 admin(service_role) 권한이 필요하다.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "서버에 service_role 키가 설정되지 않아 탈퇴를 처리할 수 없습니다." },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabase();

  // point_events.related_user_id 는 on delete cascade 가 아니다(제약 없음).
  // 추천 관계가 있으면 상대방의 이벤트가 내 프로필을 참조 → FK 위반으로 삭제가 막힌다.
  // 따라서 나를 참조하는 값을 먼저 null 로 정리한다.
  await admin
    .from("point_events")
    .update({ related_user_id: null })
    .eq("related_user_id", user.id);

  // auth.users 삭제 → profiles(on delete cascade) → 포인트/추천/상담/결제/메시지/인증 연쇄 삭제.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 세션 쿠키 정리(유저가 이미 삭제됐으므로 best-effort).
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
