import { describe, it, expect } from "vitest";
import { formatDemoLog } from "./dispatch";

describe("formatDemoLog", () => {
  it("kakao 채널은 카카오 알림톡으로 표기하고 템플릿/메시지를 포함한다", () => {
    const s = formatDemoLog({
      user_id: "u1",
      channel: "kakao",
      template_key: "welcome_d1",
      message: "회원가입해주셔서 감사합니다",
    });
    expect(s).toContain("카카오 알림톡");
    expect(s).toContain("u1");
    expect(s).toContain("welcome_d1");
    expect(s).toContain("회원가입해주셔서 감사합니다");
  });

  it("sms 채널은 문자(SMS)로 표기한다", () => {
    const s = formatDemoLog({ user_id: "u2", channel: "sms", message: "코드 123" });
    expect(s).toContain("문자(SMS)");
    expect(s).toContain("u2");
  });

  it("template_key/message 가 없으면 '-'/빈 문자열로 안전하게 처리한다", () => {
    const s = formatDemoLog({ user_id: "u3", channel: "kakao" });
    expect(s).toContain("template=-");
    expect(s).not.toContain("undefined");
  });
});
