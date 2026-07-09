import { describe, it, expect, test } from "vitest";
import { formatDemoLog, dispatchDueMessages } from "./dispatch";

// 발송 워커용 인메모리 페이크 — update().eq().lte().select() 체인과 in() 지원
function makeDispatchDb(
  jobs: Array<Record<string, unknown>>,
  profiles: Array<Record<string, unknown>>
) {
  const store = { message_jobs: jobs, profiles };
  class QB {
    private _update: Record<string, unknown> | null = null;
    private _eq: [string, unknown][] = [];
    private _lte: [string, unknown][] = [];
    constructor(private table: string) {}
    select() {
      // claim: update + eq + lte 조건에 맞는 행을 갱신 후 반환
      if (this._update) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (store as any)[this.table].filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r: any) =>
            this._eq.every(([c, v]) => r[c] === v) &&
            this._lte.every(([c, v]) => (r[c] as string) <= (v as string))
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows.forEach((r: any) => Object.assign(r, this._update));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return Promise.resolve({ data: rows.map((r: any) => ({ ...r })), error: null });
      }
      return this;
    }
    update(fields: Record<string, unknown>) {
      this._update = fields;
      return this;
    }
    eq(c: string, v: unknown) {
      this._eq.push([c, v]);
      // update().eq(id) 종결형(마킹) — 조건 매칭 행 갱신
      if (this._update && c === "id") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (store as any)[this.table]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((r: any) => r[c] === v)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .forEach((r: any) => Object.assign(r, this._update));
        return Promise.resolve({ error: null });
      }
      return this;
    }
    lte(c: string, v: unknown) {
      this._lte.push([c, v]);
      return this;
    }
    in(c: string, vals: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (store as any)[this.table].filter((r: any) =>
        vals.includes(r[c])
      );
      return Promise.resolve({ data, error: null });
    }
  }
  return { db: { from: (t: string) => new QB(t) }, store };
}

test("dispatchDueMessages: 번호 있으면 send 호출, 없으면 failed", async () => {
  const { db, store } = makeDispatchDb(
    [
      { id: "j1", user_id: "u1", template_key: "signup_done", message: "본문1", status: "pending", scheduled_at: "2026-07-09T00:00:00.000Z" },
      { id: "j2", user_id: "u2", template_key: "purchase_thanks", message: "본문2", status: "pending", scheduled_at: "2026-07-09T00:00:00.000Z" },
    ],
    [
      { id: "u1", phone: "01011112222" },
      { id: "u2", phone: null },
    ]
  );
  const calls: Array<{ to: string; templateKey?: string | null }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await dispatchDueMessages(db as any, {
    isConfigured: () => true,
    send: async (a) => {
      calls.push({ to: a.to, templateKey: a.templateKey });
    },
    now: new Date("2026-07-09T01:00:00.000Z"),
  });
  expect(res).toEqual({ mode: "real", sent: 1, failed: 1 });
  expect(calls).toEqual([{ to: "01011112222", templateKey: "signup_done" }]);
  expect(store.message_jobs.find((j) => j.id === "j2")!.status).toBe("failed");
});

test("dispatchDueMessages: send 예외 시 failed 로 정정", async () => {
  const { db, store } = makeDispatchDb(
    [{ id: "j1", user_id: "u1", template_key: "signup_done", message: "본문", status: "pending", scheduled_at: "2026-07-09T00:00:00.000Z" }],
    [{ id: "u1", phone: "01011112222" }]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await dispatchDueMessages(db as any, {
    isConfigured: () => true,
    send: async () => {
      throw new Error("solapi 접수 실패");
    },
    now: new Date("2026-07-09T01:00:00.000Z"),
  });
  expect(res).toEqual({ mode: "real", sent: 0, failed: 1 });
  expect(store.message_jobs[0].status).toBe("failed");
});

test("dispatchDueMessages: 솔라피 미설정이면 demo 모드로 선점만", async () => {
  const { db, store } = makeDispatchDb(
    [{ id: "j1", user_id: "u1", template_key: "signup_done", message: "본문", status: "pending", scheduled_at: "2026-07-09T00:00:00.000Z" }],
    [{ id: "u1", phone: "01011112222" }]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await dispatchDueMessages(db as any, {
    isConfigured: () => false,
    send: async () => {
      throw new Error("호출되면 안 됨");
    },
    now: new Date("2026-07-09T01:00:00.000Z"),
  });
  expect(res).toEqual({ mode: "demo", sent: 1, failed: 0 });
  expect(store.message_jobs[0].status).toBe("sent");
});

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
