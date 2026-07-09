/** 발송 워커의 순수 로직. 실제 전송(Solapi 등)은 주입/교체한다. */
import "server-only";
import { isSolapiConfigured, sendViaSolapi } from "./solapi";
import type { MessageJob } from "./types";

export interface DemoDispatchJob {
  user_id: string;
  channel: string;
  template_key?: string | null;
  message?: string | null;
}

/**
 * 데모 발송 로그 문자열. 실제 전송 대신 이 문구를 콘솔에 찍어 "발송했다 치고" 처리한다.
 * 상용화 시 route 의 목업 호출을 Solapi 실발송으로 교체하면 된다.
 */
export function formatDemoLog(job: DemoDispatchJob): string {
  const target = job.channel === "sms" ? "문자(SMS)" : "카카오 알림톡";
  return `[코치링][DEMO] ${target} 발송 (user=${job.user_id}, template=${
    job.template_key ?? "-"
  }): ${job.message ?? ""}`;
}

export interface DispatchDeps {
  /** 실제 전송기. 기본값은 솔라피 실발송. 테스트에서 주입 교체. */
  send?: (args: {
    to: string;
    text: string;
    templateKey?: string | null;
  }) => Promise<void>;
  /** 실발송 가능 여부. 기본값은 솔라피 설정 확인. */
  isConfigured?: () => boolean;
  now?: Date;
}

export interface DispatchResult {
  mode: "demo" | "real";
  sent: number;
  failed: number;
}

/**
 * 발송 시점이 된 pending 메시지를 선점(pending→sent)한 뒤 전송한다.
 *  - 선점은 원자적 UPDATE+RETURNING → 동시 호출에도 중복발송 방지.
 *  - 미설정 시 콘솔 데모 로그(이미 sent 로 선점됨).
 *  - 수신번호 없음/전송 예외 건은 failed 로 정정.
 * 크론 라우트·가입/결제 인라인 트리거가 공용한다.
 */
export async function dispatchDueMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  {
    send = sendViaSolapi,
    isConfigured = isSolapiConfigured,
    now = new Date(),
  }: DispatchDeps = {}
): Promise<DispatchResult> {
  const nowIso = now.toISOString();

  const { data, error } = await admin
    .from("message_jobs")
    .update({ status: "sent", sent_at: nowIso })
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .select();
  if (error) throw new Error(error.message);

  const jobs = (data as MessageJob[]) ?? [];
  const mode: "demo" | "real" = isConfigured() ? "real" : "demo";
  if (jobs.length === 0) return { mode, sent: 0, failed: 0 };

  if (mode === "demo") {
    for (const job of jobs) console.log(formatDemoLog(job));
    return { mode: "demo", sent: jobs.length, failed: 0 };
  }

  const userIds = [...new Set(jobs.map((j) => j.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, phone, display_name")
    .in("id", userIds);
  const phoneOf = new Map<string, string | null>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profiles ?? []).map((p: any) => [p.id as string, (p.phone as string | null) ?? null])
  );

  const markFailed = async (id: string, reason: string) => {
    await admin
      .from("message_jobs")
      .update({ status: "failed", sent_at: null })
      .eq("id", id);
    console.warn(`[코치링][발송실패] job=${id}: ${reason}`);
  };

  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const phone = phoneOf.get(job.user_id);
    if (!phone) {
      await markFailed(job.id, "수신 번호 없음(휴대폰 미인증)");
      failed++;
      continue;
    }
    try {
      await send({ to: phone, text: job.message ?? "", templateKey: job.template_key });
      sent++;
    } catch (e) {
      await markFailed(job.id, e instanceof Error ? e.message : "발송 오류");
      failed++;
    }
  }
  return { mode: "real", sent, failed };
}
