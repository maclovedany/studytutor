"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/**
 * 발송 워커를 수동으로 트리거하는 데모 버튼. 관리자 세션으로 dispatch 엔드포인트를 호출한다.
 * (실서비스에서는 Supabase Cron 이 1분마다 같은 엔드포인트를 자동 호출한다.)
 */
export default function DispatchButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/jobs/dispatch-messages", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "발송 처리에 실패했습니다.");
      setMsg(`발송 처리 완료: ${body.sent}건 (데모 — 콘솔 로그 확인)`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={run} disabled={loading}>
        {loading ? "처리 중..." : "지금 발송 처리 (데모)"}
      </Button>
      {msg && <span className="text-sm text-slate-500">{msg}</span>}
    </div>
  );
}
