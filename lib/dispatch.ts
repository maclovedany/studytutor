/** 발송 워커의 순수 로직. 실제 전송(Solapi 등)은 route 에서 주입/교체한다. */

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
