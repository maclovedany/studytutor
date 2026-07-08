import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

/**
 * Next.js 16 Proxy (구 middleware). 매 요청마다 Supabase 세션 토큰을 갱신하고
 * 갱신된 인증 쿠키를 응답에 실어 보낸다. 이게 없으면 액세스 토큰 만료 시
 * 서버 컴포넌트에서 자동 재발급이 안 돼 로그아웃처럼 보인다.
 *
 * 주의: 서버 컴포넌트는 쿠키를 쓸 수 없으므로 토큰 갱신은 여기(Proxy)에서만 가능하다.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Supabase 미설정 환경(로컬 초기/데모)에서는 세션 갱신을 건너뛴다 — 화면은 그대로 떠야 한다.
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() 호출이 만료된 토큰의 재발급을 트리거한다(반드시 호출).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 정적 자산·이미지 요청에는 세션 갱신이 불필요하므로 제외한다.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
