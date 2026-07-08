"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Button, Card, Input } from "@/components/ui";
import { siteConfig } from "@/lib/site-config";

const REF_KEY = "coachring_ref";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 추천 코드: ?ref= 쿼리를 우선, 없으면 localStorage 보관값
  const refFromQuery = params.get("ref");
  if (typeof window !== "undefined" && refFromQuery) {
    window.localStorage.setItem(REF_KEY, refFromQuery);
  }

  async function runAfterSignup() {
    const ref =
      typeof window !== "undefined"
        ? window.localStorage.getItem(REF_KEY)
        : null;
    try {
      await fetch("/api/auth/after-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refCode: ref }),
      });
      if (typeof window !== "undefined") window.localStorage.removeItem(REF_KEY);
    } catch {
      // 후처리 실패는 치명적이지 않음 — 멱등이라 재로그인 시 재시도됨
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError("Supabase가 설정되지 않았습니다. .env.local을 확인하세요.");
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createBrowserSupabase();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) throw error;
        // 이메일 확인이 꺼져 있으면 즉시 세션이 생긴다.
        if (data.session) {
          await runAfterSignup();
          router.push("/mypage");
          router.refresh();
        } else {
          setInfo("가입 확인 메일을 보냈습니다. 메일 인증 후 로그인해 주세요.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await runAfterSignup();
        router.push("/mypage");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleKakao() {
    if (!isSupabaseConfigured) {
      setError("Supabase가 설정되지 않았습니다. .env.local을 확인하세요.");
      return;
    }
    setError(null);
    const supabase = createBrowserSupabase();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (typeof window !== "undefined" ? window.location.origin : "");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (error)
      setError(
        error.message || "카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-2xl font-bold text-slate-900">
          {siteConfig.serviceName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login" ? "다시 오신 걸 환영해요." : "무료로 시작해 보세요."}
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            className={`rounded-lg py-2 ${mode === "login" ? "bg-white shadow" : "text-slate-500"}`}
            onClick={() => setMode("login")}
            type="button"
          >
            로그인
          </button>
          <button
            className={`rounded-lg py-2 ${mode === "signup" ? "bg-white shadow" : "text-slate-500"}`}
            onClick={() => setMode("signup")}
            type="button"
          >
            회원가입
          </button>
        </div>

        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Supabase가 설정되지 않아 로그인을 사용할 수 없습니다. <code>.env.local</code>에
            키를 입력하고 dev 서버를 재시작하세요.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <Input
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {refFromQuery && (
            <p className="text-xs text-blue-600">
              추천 코드 {refFromQuery} 적용됨 — 가입 시 추가 포인트를 받아요!
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-600">{info}</p>}
          <Button
            type="submit"
            disabled={loading || !isSupabaseConfigured}
            className="w-full"
          >
            {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          또는
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          onClick={handleKakao}
          type="button"
          disabled={!isSupabaseConfigured}
          className="w-full rounded-xl bg-[#FEE500] py-3 text-sm font-semibold text-[#191600] hover:brightness-95 disabled:opacity-50"
        >
          카카오로 시작하기
        </button>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
