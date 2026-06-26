import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";
import type { Profile } from "./types";

/** 순수 함수: admin role 여부. */
export function isAdmin(profile: Pick<Profile, "role"> | null): boolean {
  return profile?.role === "admin";
}

/** 순수 함수: 관리자 페이지 접근 가능 여부. */
export function canAccessAdmin(profile: Pick<Profile, "role"> | null): boolean {
  return isAdmin(profile);
}

/** 현재 세션의 사용자 + profiles 행을 반환. 미로그인 시 null. */
export async function getSessionProfile(): Promise<Profile | null> {
  // Supabase 미설정 시 비로그인 상태로 취급 → 공개 화면은 정상 렌더
  if (!isSupabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

/** 로그인 필수. 미로그인 시 /login 으로 redirect. */
export async function requireUser(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** 관리자 필수. 비로그인 → /login, 비관리자 → /. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!isAdmin(profile)) redirect("/");
  return profile;
}
