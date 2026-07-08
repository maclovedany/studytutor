import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { genCode, expiryFrom } from "@/lib/phone";

/**
 * 인증번호 발급. 6자리 코드를 생성해 저장한다.
 * 개발 단계: 실제 SMS를 보내지 않고 응답 + 서버 콘솔에 코드를 노출한다.
 * (상용화 시 Solapi 등 SMS API를 서버에서 호출하고 devCode는 제거)
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // service_role 미설정(예: 배포 환경 env 누락) 시 createAdminSupabase()가 예외를 던져
  // 빈 본문 500이 된다 → 명확한 JSON 에러로 대신 응답한다.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "서버 설정 오류로 인증번호를 보낼 수 없습니다. (SUPABASE_SERVICE_ROLE_KEY 미설정)" },
      { status: 503 }
    );
  }

  let phone: string | undefined;
  try {
    phone = (await request.json())?.phone;
  } catch {
    phone = undefined;
  }
  if (!phone || !/^[0-9\-+\s]{8,20}$/.test(phone)) {
    return NextResponse.json({ error: "휴대폰 번호가 올바르지 않습니다." }, { status: 400 });
  }

  const code = genCode();
  const expires_at = expiryFrom(new Date()).toISOString();

  const admin = createAdminSupabase();
  const { error } = await admin.from("phone_verifications").insert({
    user_id: user.id,
    phone,
    code,
    expires_at,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 개발용 노출
  console.log(`[코치링][DEV] 휴대폰 인증번호 (${phone}): ${code}`);

  return NextResponse.json({ ok: true, devCode: code, expires_at });
}
