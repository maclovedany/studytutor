import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { genCode, expiryFrom } from "@/lib/phone";
import { isSolapiConfigured, sendViaSolapi } from "@/lib/solapi";

/**
 * 인증번호 발급. 6자리 코드를 생성해 저장한다.
 * Solapi 설정 시 실제 SMS 로 발송하고 응답에서 코드를 숨긴다.
 * 미설정(개발) 시 실제 발송 없이 응답 + 서버 콘솔에 코드를 노출한다.
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

  // Solapi 설정 시 실제 SMS 발송(코드는 응답에 노출하지 않음).
  if (isSolapiConfigured()) {
    try {
      await sendViaSolapi({
        to: phone,
        text: `[코치링] 인증번호 ${code} (5분 내 입력해 주세요)`,
      });
    } catch {
      return NextResponse.json(
        { error: "인증번호 발송에 실패했습니다. 번호를 확인해 주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, expires_at });
  }

  // 개발 스텁: 실제 발송 없이 코드 노출
  console.log(`[코치링][DEV] 휴대폰 인증번호 (${phone}): ${code}`);
  return NextResponse.json({ ok: true, devCode: code, expires_at });
}
