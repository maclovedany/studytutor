import "server-only";

/**
 * Solapi 실발송 래퍼. 자격증명이 없으면 발송을 시도하지 않는다(호출부가 데모 폴백).
 * 서버 전용 — API Secret 은 절대 클라이언트로 나가지 않는다.
 */

/** 실발송 가능 여부: API 키/시크릿 + 발신번호가 모두 있어야 한다. */
export function isSolapiConfigured(): boolean {
  return Boolean(
    process.env.SOLAPI_API_KEY &&
      process.env.SOLAPI_API_SECRET &&
      process.env.SOLAPI_SENDER_PHONE
  );
}

/** 전화번호 정규화 — Solapi 는 하이픈/공백 없는 숫자만 받는다. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/**
 * template_key → 승인된 카카오 알림톡 templateId 매핑.
 * env `SOLAPI_TEMPLATE_<대문자키>` 로 주입한다. 없으면 undefined → SMS 로 발송된다.
 * 예: template_key "welcome_d1" → env SOLAPI_TEMPLATE_WELCOME_D1
 */
export function alimtalkTemplateId(
  templateKey: string | null | undefined
): string | undefined {
  if (!templateKey) return undefined;
  return process.env[`SOLAPI_TEMPLATE_${templateKey.toUpperCase()}`] || undefined;
}

export interface SendArgs {
  /** 수신 전화번호 (정규화 전/후 무관 — 내부에서 정규화) */
  to: string;
  /** 메시지 본문. 알림톡일 때는 SMS 대체발송용 문구로도 쓰인다. */
  text: string;
  /** 알림톡 템플릿 식별용 키. 없거나 매핑이 없으면 SMS 로 발송. */
  templateKey?: string | null;
  /** 알림톡 템플릿 치환 변수 (예: { "#{이름}": "홍길동" }) */
  variables?: Record<string, string>;
}

/**
 * 실발송. pfId + 승인 templateId 가 있으면 카카오 알림톡(+실패 시 SMS 폴백),
 * 없으면 일반 SMS 로 보낸다. 접수 실패 시 예외를 던진다(호출부에서 failed 처리).
 */
export async function sendViaSolapi({
  to,
  text,
  templateKey,
  variables,
}: SendArgs): Promise<void> {
  const { SolapiMessageService } = await import("solapi");
  const svc = new SolapiMessageService(
    process.env.SOLAPI_API_KEY!,
    process.env.SOLAPI_API_SECRET!
  );
  const from = normalizePhone(process.env.SOLAPI_SENDER_PHONE!);
  const toNormalized = normalizePhone(to);
  const pfId = process.env.SOLAPI_PFID;
  const templateId = alimtalkTemplateId(templateKey);

  if (pfId && templateId) {
    // 카카오 알림톡 (disableSms:false → 알림톡 실패 시 자동 SMS 대체발송)
    await svc.send({
      to: toNormalized,
      from,
      text,
      kakaoOptions: {
        pfId,
        templateId,
        disableSms: false,
        ...(variables ? { variables } : {}),
      },
    });
  } else {
    // 일반 SMS (본문 길이에 따라 SDK 가 SMS/LMS 자동 판별)
    await svc.send({ to: toNormalized, from, text });
  }
}
