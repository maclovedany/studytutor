import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  isZoomConfigured,
  generateSdkSignature,
  createZoomMeeting,
} from "./zoom";

const ENV_KEYS = [
  "ZOOM_ACCOUNT_ID",
  "ZOOM_S2S_CLIENT_ID",
  "ZOOM_S2S_CLIENT_SECRET",
  "ZOOM_SDK_CLIENT_ID",
  "ZOOM_SDK_CLIENT_SECRET",
] as const;

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    process.env[k] = `test-${k.toLowerCase()}`;
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isZoomConfigured", () => {
  it("5종 env 가 모두 있으면 true", () => {
    expect(isZoomConfigured()).toBe(true);
  });
  it("하나라도 없으면 false", () => {
    delete process.env.ZOOM_SDK_CLIENT_SECRET;
    expect(isZoomConfigured()).toBe(false);
  });
});

describe("generateSdkSignature", () => {
  it("JWT 클레임과 HMAC 서명이 올바르다", () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const token = generateSdkSignature({ meetingNumber: "123456789", role: 0, now });
    const [h, p, sig] = token.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());

    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(payload.appKey).toBe(process.env.ZOOM_SDK_CLIENT_ID);
    expect(payload.sdkKey).toBe(process.env.ZOOM_SDK_CLIENT_ID);
    expect(payload.mn).toBe("123456789");
    expect(payload.role).toBe(0);
    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(1800);
    expect(payload.tokenExp).toBe(payload.exp);

    const expected = createHmac("sha256", process.env.ZOOM_SDK_CLIENT_SECRET!)
      .update(`${h}.${p}`)
      .digest("base64url");
    expect(sig).toBe(expected);
  });
});

describe("createZoomMeeting", () => {
  it("토큰 발급 후 미팅을 생성하고 id/password/joinUrl 을 반환한다", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("zoom.us/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "tok-1" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ id: 987654321, password: "pw12", join_url: "https://zoom.us/j/987654321" }),
        { status: 200 }
      );
    }) as typeof fetch;

    const meeting = await createZoomMeeting("코치링 상담", fakeFetch);

    expect(meeting).toEqual({
      id: "987654321",
      password: "pw12",
      joinUrl: "https://zoom.us/j/987654321",
    });
    // 1) 토큰 요청: account_credentials + Basic auth
    expect(calls[0].url).toContain("grant_type=account_credentials");
    expect(calls[0].url).toContain(`account_id=${process.env.ZOOM_ACCOUNT_ID}`);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    // 2) 미팅 생성: bearer + join_before_host
    expect(calls[1].url).toBe("https://api.zoom.us/v2/users/me/meetings");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body.settings.join_before_host).toBe(true);
  });

  it("토큰 발급 실패 시 예외를 던진다", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    await expect(createZoomMeeting("t", fakeFetch)).rejects.toThrow();
  });
});
