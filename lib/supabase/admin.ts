import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * service_role key를 사용하는 관리자 클라이언트 — RLS를 우회한다.
 * 서버(API Route)에서만 import 해야 하며, 클라이언트 번들에 절대 포함되면 안 된다.
 * 포인트 지급, tier 변경, 정책 수정 등 모든 쓰기 작업에 사용한다.
 */
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
