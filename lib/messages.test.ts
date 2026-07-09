import { expect, test } from "vitest";
import { MESSAGE_TEMPLATES, buildJobRow } from "./messages";

test("카탈로그에 3개 트리거 템플릿이 있고 모두 kakao 채널이다", () => {
  const keys = Object.values(MESSAGE_TEMPLATES).map((t) => t.key);
  expect(keys).toEqual(["signup_done", "purchase_thanks", "usage_checkin_d1"]);
  for (const t of Object.values(MESSAGE_TEMPLATES)) {
    expect(t.channel).toBe("kakao");
    expect(t.text.length).toBeGreaterThan(0);
  }
});

test("buildJobRow 는 pending 상태의 message_jobs 행을 만든다", () => {
  const at = new Date("2026-07-09T00:00:00.000Z");
  const row = buildJobRow("u1", MESSAGE_TEMPLATES.signup_done, at);
  expect(row).toEqual({
    user_id: "u1",
    channel: "kakao",
    template_key: "signup_done",
    message: MESSAGE_TEMPLATES.signup_done.text,
    scheduled_at: "2026-07-09T00:00:00.000Z",
    status: "pending",
  });
});
