"use client";

import { useEffect, useRef, useState } from "react";

const SDK_VERSION = "6.2.0";
const SDK_URL = `https://source.zoom.us/${SDK_VERSION}/zoom-meeting-embedded-${SDK_VERSION}.min.js`;

// Zoom CDN 전역 번들의 최소 타입 선언.
// npm 패키지(@zoom/meetingsdk)는 react@18.2.0 고정 peer 라 React 19 웹과 충돌 → CDN 사용.
interface EmbeddedClientLike {
  init(opts: { zoomAppRoot: HTMLElement; language?: string }): Promise<void>;
  join(opts: {
    signature: string;
    meetingNumber: string;
    password?: string;
    userName: string;
  }): Promise<void>;
  leaveMeeting(): Promise<void>;
}
declare global {
  interface Window {
    ZoomMtgEmbedded?: { createClient(): EmbeddedClientLike };
  }
}

/** CDN 스크립트를 1회만 주입하고 로드를 기다린다. */
function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.ZoomMtgEmbedded) return resolve();
    const existing = document.getElementById(
      "zoom-sdk-script"
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Zoom SDK 로드 실패"))
      );
      return;
    }
    const s = document.createElement("script");
    s.id = "zoom-sdk-script";
    s.src = SDK_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Zoom SDK 로드 실패"));
    document.body.appendChild(s);
  });
}

/**
 * Room 안에 Zoom 미팅을 임베드한다.
 *  - 마운트: 서명 발급(서버 게이트 통과 시) → SDK init/join
 *  - 언마운트: leaveMeeting → 15분 페이월 때 Room 이 언마운트하면 자동 퇴장,
 *    결제 후 재마운트하면 새 서명으로 재입장된다.
 *  - 서명 403(결제 필요)은 조용히 넘어간다 — Room 의 결제 모달이 안내.
 */
export default function ZoomMeeting({
  consultationId,
}: {
  consultationId: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<EmbeddedClientLike | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/zoom/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultationId }),
        });
        if (res.status === 403) return; // 결제 필요 — 모달이 안내
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "서명 발급 실패");

        await loadSdk();
        if (cancelled || !rootRef.current || !window.ZoomMtgEmbedded) return;

        const client = window.ZoomMtgEmbedded.createClient();
        clientRef.current = client;
        await client.init({ zoomAppRoot: rootRef.current, language: "ko-KR" });
        await client.join({
          signature: body.signature,
          meetingNumber: body.meetingNumber,
          password: body.password,
          userName: body.userName,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "미팅 연결 실패");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
      clientRef.current?.leaveMeeting().catch(() => {});
      clientRef.current = null;
    };
  }, [consultationId]);

  if (error) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        미팅 임베드를 불러오지 못했습니다 — 아래 Zoom 링크로 입장해 주세요. ({error})
      </p>
    );
  }
  return <div ref={rootRef} className="min-h-80 w-full" />;
}
