import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * OAuth(카카오 등) 콜백. 코드 교환으로 세션을 만들고 콜백 처리 페이지로 보낸다.
 * 추천코드/가입 후처리는 /auth/complete 클라이언트에서 처리한다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/auth/complete`);
}
