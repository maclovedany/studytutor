"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

/**
 * 회원 탈퇴 — 2단계 확인 후 /api/account/delete 를 호출한다.
 * 성공 시 로컬 세션을 정리하고 홈으로 이동한다. (되돌릴 수 없는 하드 삭제)
 */
export default function DeleteAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "탈퇴 처리에 실패했습니다.");
      }
      // 서버에서 이미 세션을 정리하지만, 브라우저 측 세션도 로컬로 정리한다(네트워크 호출 없음).
      try {
        await createBrowserSupabase().auth.signOut({ scope: "local" });
      } catch {
        // 로컬 정리 실패는 무시 — 서버 쿠키는 이미 만료됨
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="danger" type="button" onClick={() => setConfirming(true)}>
        회원 탈퇴
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        탈퇴하면 계정과{" "}
        <strong>포인트·추천 관계·상담/결제 내역</strong>이 모두 삭제되며 되돌릴 수
        없습니다. 정말 탈퇴하시겠어요?
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="danger"
          type="button"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? "탈퇴 처리 중..." : "네, 탈퇴합니다"}
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={loading}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
