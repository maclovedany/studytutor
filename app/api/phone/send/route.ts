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
