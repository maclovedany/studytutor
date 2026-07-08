import { describe, it, expect, afterEach } from "vitest";
import { normalizePhone, alimtalkTemplateId, isSolapiConfigured } from "./solapi";

describe("normalizePhone", () => {
  it("하이픈/공백을 제거하고 숫자만 남긴다", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone("010 1234 5678")).toBe("01012345678");
    expect(normalizePhone("+82 10-1234-5678")).toBe("821012345678");
  });
});

describe("alimtalkTemplateId", () => {
  afterEach(() => {
    delete process.env.SOLAPI_TEMPLATE_WELCOME_D1;
  });

  it("template_key 를 대문자 env 키로 매핑한다", () => {
    process.env.SOLAPI_TEMPLATE_WELCOME_D1 = "TMPL_123";
    expect(alimtalkTemplateId("welcome_d1")).toBe("TMPL_123");
  });

  it("매핑 env 가 없으면 undefined (→ SMS 발송)", () => {
    expect(alimtalkTemplateId("welcome_d1")).toBeUndefined();
    expect(alimtalkTemplateId(null)).toBeUndefined();
    expect(alimtalkTemplateId(undefined)).toBeUndefined();
  });
});

describe("isSolapiConfigured", () => {
  const keys = ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER_PHONE"];
  afterEach(() => keys.forEach((k) => delete process.env[k]));

  it("셋 중 하나라도 없으면 false", () => {
    process.env.SOLAPI_API_KEY = "a";
    process.env.SOLAPI_API_SECRET = "b";
    expect(isSolapiConfigured()).toBe(false);
  });

  it("셋 다 있으면 true", () => {
    process.env.SOLAPI_API_KEY = "a";
    process.env.SOLAPI_API_SECRET = "b";
    process.env.SOLAPI_SENDER_PHONE = "01000000000";
    expect(isSolapiConfigured()).toBe(true);
  });
});
