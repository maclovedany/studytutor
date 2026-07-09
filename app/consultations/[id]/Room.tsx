"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Card } from "@/components/ui";
import ZoomMeeting from "@/components/ZoomMeeting";
import { FREE_LIMIT_SECONDS, elapsedSeconds, shouldShowPaywall } from "@/lib/timer";
import type { Consultation, Tier } from "@/lib/types";

function fmt(sec: number) {
  const m = Math.floor(Math.max(sec, 0) / 60);
  const s = Math.max(sec, 0) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Room({
  consultation,
  tier,
}: {
  consultation: Consultation;
  tier: Tier;
}) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [starting, setStarting] = useState(false);
  const [paying, setPaying] = useState(false);

  // 클라이언트에서만 시계를 돌린다 (SSR 불일치 방지).
  // 첫 값은 다음 프레임에 세팅해 effect 본문의 동기 setState를 피한다.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const raf = requestAnimationFrame(tick);
    const t = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);

  async function start() {
    setStarting(true);
    await fetch(`/api/consultations/${consultation.id}/start`, { method: "POST" });
    setStarting(false);
    router.refresh();
  }

  async function pay() {
    setPaying(true);
    await fetch("/api/payments/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: consultation.id }),
    });
    setPaying(false);
    router.refresh();
  }

  // 아직 시작 전
  if (!consultation.started_at) {
    return (
      <Card className="text-center">
        <p className="text-slate-600">준비되면 상담을 시작하세요. 15분간 무료입니다.</p>
        <div className="mt-4">
          <Button onClick={start} disabled={starting}>
            {starting ? "시작 중..." : "상담 시작하기"}
          </Button>
        </div>
      </Card>
    );
  }

  const elapsed = now ? elapsedSeconds(consultation.started_at, now) : 0;
  const remaining = FREE_LIMIT_SECONDS - elapsed;
  const paywall = now
    ? shouldShowPaywall({ tier }, consultation.started_at, now)
    : false;
  const isPaid = tier === "paid";

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <p className="text-sm text-slate-500">
          {isPaid ? "유료 상담 진행 중" : remaining > 0 ? "무료 상담 진행 중" : "무료 상담 종료"}
        </p>
        <p className="mt-2 text-5xl font-extrabold tabular-nums text-slate-900">
          {fmt(elapsed)}
        </p>
        {!isPaid && (
          <p className="mt-2 text-sm text-slate-500">
            {remaining > 0
              ? `무료 상담 ${fmt(remaining)} 남음`
              : "무료 시간이 종료되었습니다"}
          </p>
        )}
        <div className="mt-5">
          <ButtonLink
            href={consultation.zoom_url ?? "#"}
            target="_blank"
            variant={consultation.zoom_meeting_id ? "ghost" : "secondary"}
          >
            {consultation.zoom_meeting_id ? "Zoom 앱으로 열기" : "Zoom으로 입장하기"}
          </ButtonLink>
        </div>
      </Card>

      {/* 임베드 미팅 — 페이월이 뜨면 언마운트(자동 퇴장), 결제 후 재마운트(재입장) */}
      {consultation.zoom_meeting_id && !paywall && (
        <Card>
          <ZoomMeeting consultationId={consultation.id} />
        </Card>
      )}

      {/* 결제 유도 모달 */}
      {paywall && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              무료 상담이 종료되었어요
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              상담을 계속 이어가려면 결제가 필요합니다. 지금 결제하고 유료회원이
              되어 이어서 상담하세요.
            </p>
            <p className="mt-4 text-2xl font-extrabold text-blue-600">
              ₩9,900
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={pay} disabled={paying}>
                {paying ? "결제 중..." : "데모 결제하고 계속하기"}
              </Button>
              <ButtonLink href="/consultations" variant="ghost">
                나중에 하기
              </ButtonLink>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              실제 결제는 발생하지 않는 데모입니다.
            </p>
          </div>
        </div>
      )}

      {isPaid && (
        <Card className="bg-green-50 text-center text-sm text-green-700">
          유료회원으로 전환되어 상담을 계속 진행할 수 있습니다. 🎉
        </Card>
      )}
    </div>
  );
}
