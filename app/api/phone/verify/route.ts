import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { verifyCode } from "@/lib/phone";

/**
 * 인증번호 검증. 성공 시 phone_verifications.verified_at 과
 * profiles.phone_verified_at / phone 을 저장한다.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let input: string | undefined;
  try {
    input = (await request.json())?.code;
  } catch {
    input = undefined;
  }
  if (!input) {
    return NextResponse.json({ error: "인증번호를 입력하세요." }, { status: 400 });
  }

  const admin = createAdminSupabase();
  // 가장 최근 미사용 인증 레코드
  const { data: record } = await admin
    .from("phone_verifications")
    .select("*")
    .eq("user_id", user.id)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!record) {
    return NextResponse.json(
      { error: "인증 요청 내역이 없습니다. 다시 요청해 주세요." },
      { status: 400 }
    );
  }

  const result = verifyCode(record, input, new Date());
  if (!result.ok) {
    const messages: Record<string, string> = {
      expired: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
      mismatch: "인증번호가 일치하지 않습니다.",
      used: "이미 사용된 인증번호입니다.",
    };
    return NextResponse.json({ error: messages[result.reason] }, { status: 400 });
  }

  const verifiedAt = new Date().toISOString();
  await admin
    .from("phone_verifications")
    .update({ verified_at: verifiedAt })
    .eq("id", record.id);
  await admin
    .from("profiles")
    .update({ phone: record.phone, phone_verified_at: verifiedAt })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
