// Supabase 환경변수 — 서버/클라이언트 공용.
// NEXT_PUBLIC_* 값은 빌드 시 인라인되므로 양쪽에서 모두 읽을 수 있다.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** URL과 anon key가 모두 설정되어 있는지 여부. 미설정 시 화면은 떠야 한다. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
