/** 이벤트 트리거 알림톡 메시지 카탈로그 (단일 소스).
 *  template_key 는 env `SOLAPI_TEMPLATE_<대문자키>` 로 승인 알림톡 templateId 에 매핑된다.
 *  text 는 알림톡 본문 겸 SMS 대체발송 문구이며, 승인된 템플릿 내용과 일치해야 한다. */

export interface MessageTemplate {
  key: string;
  channel: "kakao";
  text: string;
}

export const MESSAGE_TEMPLATES = {
  signup_done: {
    key: "signup_done",
    channel: "kakao",
    text: "회원가입이 완료되었습니다. 15분 무료 상담을 지금 시작해보세요.",
  },
  purchase_thanks: {
    key: "purchase_thanks",
    channel: "kakao",
    text: "결제가 완료되었습니다. 구매해주셔서 감사합니다. 상담 이용이 활성화되었습니다.",
  },
  usage_checkin_d1: {
    key: "usage_checkin_d1",
    channel: "kakao",
    text: "상담은 잘 이용하고 계신가요? 이용 중 불편한 점이 있으면 언제든 문의해주세요.",
  },
} as const satisfies Record<string, MessageTemplate>;

/** message_jobs insert 용 행 객체를 만든다. */
export function buildJobRow(
  userId: string,
  template: MessageTemplate,
  scheduledAt: Date
) {
  return {
    user_id: userId,
    channel: template.channel,
    template_key: template.key,
    message: template.text,
    scheduled_at: scheduledAt.toISOString(),
    status: "pending" as const,
  };
}
