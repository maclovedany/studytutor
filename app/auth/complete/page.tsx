"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REF_KEY = "coachring_ref";

/**
 * OAuth 콜백 직후 도착하는 페이지. 보관된 추천코드로 가입 후처리(after-signup)를
 * 멱등 호출한 뒤 마이페이지로 이동한다.
 */
export default function AuthCompletePage() {
  const router = useRouter();

  useEffect(() => {
    const ref = window.localStorage.getItem(REF_KEY);
    fetch("/api/auth/after-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refCode: ref }),
    })
      .catch(() => {})
      .finally(() => {
        window.localStorage.removeItem(REF_KEY);
        router.replace("/mypage");
        router.refresh();
      });
  }, [router]);

  return (
    <p className="py-20 text-center text-sm text-slate-500">로그인 처리 중...</p>
  );
}
