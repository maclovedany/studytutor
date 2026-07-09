import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** 앱 전용 Supabase 클라이언트.
 *  - AsyncStorage 에 세션 저장(앱 재실행 시 로그인 유지)
 *  - RN 은 URL 리다이렉트 감지가 없으므로 detectSessionInUrl:false
 *  - OAuth 는 PKCE 흐름(code → exchangeCodeForSession) */
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

/** env 설정 여부 — 미설정 시 로그인 화면에서 안내. */
export const isSupabaseConfigured = Boolean(url && anonKey);
