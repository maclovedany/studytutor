# 이벤트 기반 카카오 알림톡 자동 발송 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 즉시·결제 즉시·결제+1일 시점에 카카오 알림톡(솔라피)을 자동 발송한다.

**Architecture:** 기존 `message_jobs` 예약 큐 + 솔라피 래퍼 위에 이벤트 트리거를 얹는다. 라우트에만 있던 발송 루프를 `lib/dispatch.ts`의 `dispatchDueMessages()`로 추출해 크론·가입·결제 세 곳이 공용한다. 메시지 문구/시점은 `lib/messages.ts` 단일 카탈로그로 관리한다.

**Tech Stack:** Next.js(App Router), TypeScript, Supabase(service_role), Solapi SDK, Vitest.

## Global Constraints

- 이 프로젝트의 Next.js는 학습 데이터와 다를 수 있음 → 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 참고(AGENTS.md).
- 테스트 러너: `npx vitest run <파일>` (스크립트: `npm test` = `vitest run`).
- 도메인 함수(`runAfterSignup`/`runDemoPayment`)는 **행 insert만** 담당하고, 외부 발송 트리거는 **라우트가 오케스트레이션**한다.
- 발송 실패가 가입/결제 응답을 실패시키지 않는다(인라인 dispatch는 try/catch).
- `message_jobs` 스키마(변경 없음): `user_id, channel, template_key, message, scheduled_at, status('pending'|'sent'|'failed'), sent_at`.
- template_key 는 소문자, env 매핑은 `SOLAPI_TEMPLATE_<대문자키>` (예: `signup_done` → `SOLAPI_TEMPLATE_SIGNUP_DONE`).
- 서버 전용 모듈(`server-only`, service_role, 솔라피)은 클라이언트 번들에 포함 금지.

## File Structure

- `lib/messages.ts` (신설) — 메시지 카탈로그 + `buildJobRow` 헬퍼. 단일 책임: "무엇을 언제 보낼지" 정의.
- `lib/messages.test.ts` (신설) — 카탈로그/헬퍼 단위 테스트.
- `lib/dispatch.ts` (수정) — `formatDemoLog`(기존) + `dispatchDueMessages`(추출·신설).
- `lib/dispatch.test.ts` (수정) — `dispatchDueMessages` 테스트 추가.
- `app/api/jobs/dispatch-messages/route.ts` (수정) — 발송 루프를 `dispatchDueMessages` 호출로 축소.
- `lib/after-signup.ts` (수정) — 1/3/7일 3건 → `signup_done` 즉시 1건.
- `lib/after-signup.test.ts` (수정) — 1건 예약 검증으로 갱신.
- `lib/payment.ts` (수정) — 결제 시 `purchase_thanks`(now) + `usage_checkin_d1`(now+24h) 예약.
- `lib/payment.test.ts` (수정) — 2건 예약 검증 추가(페이크 insert 배열 지원).
- `app/api/auth/after-signup/route.ts` (수정) — 가입 후 인라인 dispatch.
- `app/api/payments/demo/route.ts` (수정) — 결제 후 인라인 dispatch.
- `.env.local.example` (수정) — 템플릿 env 키 3종 교체.

---

## Task 1: 메시지 카탈로그 `lib/messages.ts`

**Files:**
- Create: `lib/messages.ts`
- Test: `lib/messages.test.ts`

**Interfaces:**
- Produces:
  - `interface MessageTemplate { key: string; channel: "kakao"; text: string }`
  - `const MESSAGE_TEMPLATES: { signup_done: MessageTemplate; purchase_thanks: MessageTemplate; usage_checkin_d1: MessageTemplate }`
  - `function buildJobRow(userId: string, template: MessageTemplate, scheduledAt: Date): { user_id: string; channel: string; template_key: string; message: string; scheduled_at: string; status: "pending" }`

- [ ] **Step 1: Write the failing test**

Create `lib/messages.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/messages.test.ts`
Expected: FAIL — `Cannot find module './messages'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/messages.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/messages.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/messages.ts lib/messages.test.ts
git commit -m "feat: 이벤트 알림톡 메시지 카탈로그(lib/messages)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 발송 루프 추출 `dispatchDueMessages`

**Files:**
- Modify: `lib/dispatch.ts` (append)
- Test: `lib/dispatch.test.ts` (append)

**Interfaces:**
- Consumes: `sendViaSolapi`, `isSolapiConfigured` (from `./solapi`), `formatDemoLog` (기존), `MessageJob` (from `./types`).
- Produces:
  - `interface DispatchDeps { send?: (a: { to: string; text: string; templateKey?: string | null }) => Promise<void>; isConfigured?: () => boolean; now?: Date }`
  - `interface DispatchResult { mode: "demo" | "real"; sent: number; failed: number }`
  - `function dispatchDueMessages(admin: any, deps?: DispatchDeps): Promise<DispatchResult>`

- [ ] **Step 1: Write the failing test**

Append to `lib/dispatch.test.ts` (keep existing `formatDemoLog` tests):

```ts
import { dispatchDueMessages } from "./dispatch";

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
    private _in: [string, unknown[]] | null = null;
    constructor(private table: string) {}
    select() {
      // claim: update + eq + lte 조건에 맞는 행을 갱신 후 반환
      if (this._update) {
        const rows = (store as any)[this.table].filter(
          (r: any) =>
            this._eq.every(([c, v]) => r[c] === v) &&
            this._lte.every(([c, v]) => r[c] <= v)
        );
        rows.forEach((r: any) => Object.assign(r, this._update));
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
        (store as any)[this.table]
          .filter((r: any) => r[c] === v)
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
      this._in = [c, vals];
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dispatch.test.ts`
Expected: FAIL — `dispatchDueMessages` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/dispatch.ts`:

```ts
import "server-only";
import { isSolapiConfigured, sendViaSolapi } from "./solapi";
import type { MessageJob } from "./types";

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
```

Note: `import "server-only"` 는 파일 상단으로 옮겨도 되지만, vitest(node)에서는 무해하므로 append 위치에 두어도 통과한다. 정리하고 싶으면 파일 맨 위 한 줄로 이동해도 된다(동작 동일).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/dispatch.test.ts`
Expected: PASS (기존 3 + 신규 3 = 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dispatch.ts lib/dispatch.test.ts
git commit -m "feat: 발송 루프를 dispatchDueMessages 로 추출(주입 가능)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 발송 라우트를 `dispatchDueMessages` 로 축소

**Files:**
- Modify: `app/api/jobs/dispatch-messages/route.ts`

**Interfaces:**
- Consumes: `dispatchDueMessages(admin)` (Task 2). 응답 형태 `{ ok: true, mode, sent, failed }` 유지 → `DispatchButton` 이 `body.sent` 를 읽으므로 호환.

- [ ] **Step 1: Replace file body**

`app/api/jobs/dispatch-messages/route.ts` 를 아래로 교체(인증·service_role 가드는 유지, 발송 루프만 위임):

```ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { dispatchDueMessages } from "@/lib/dispatch";

/**
 * 예약 메시지 발송 워커.
 * 인증: `x-cron-secret` 헤더(스케줄러) 또는 관리자 세션(관리자 화면 버튼).
 * 발송 로직은 lib/dispatch.dispatchDueMessages 로 위임(가입/결제 인라인 트리거와 공용).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const viaCron =
    Boolean(cronSecret) && request.headers.get("x-cron-secret") === cronSecret;

  if (!viaCron) {
    const profile = await getSessionProfile();
    if (!isAdmin(profile)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "service_role 미설정으로 발송할 수 없습니다." },
      { status: 503 }
    );
  }

  try {
    const admin = createAdminSupabase();
    const result = await dispatchDueMessages(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "발송 처리 오류" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify types & lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint app/api/jobs/dispatch-messages/route.ts`
Expected: no errors.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 4: Commit**

```bash
git add app/api/jobs/dispatch-messages/route.ts
git commit -m "refactor: 발송 라우트가 dispatchDueMessages 를 호출하도록 축소

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 가입 즉시 `signup_done` 예약

**Files:**
- Modify: `lib/after-signup.ts`
- Test: `lib/after-signup.test.ts`

**Interfaces:**
- Consumes: `MESSAGE_TEMPLATES`, `buildJobRow` (Task 1).
- Produces: `runAfterSignup` 시그니처 불변, 결과 `messages` 는 이제 `1`(멱등 no-op 시 `0`).

- [ ] **Step 1: Update the failing test**

`lib/after-signup.test.ts` 에서 기존 `"grants signup + schedules 3 messages, no ref"` 테스트를 아래로 교체:

```ts
test("grants signup + schedules 1 immediate message, no ref", async () => {
  const { db, store } = makeDb({ existingSignup: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await runAfterSignup(db as any, { userId: "u1" });
  expect(r.granted).toContain("signup");
  expect(r.messages).toBe(1);
  expect(r.referred).toBe(false);
  expect(store.message_jobs).toHaveLength(1);
  expect(store.message_jobs[0]).toMatchObject({
    template_key: "signup_done",
    channel: "kakao",
    status: "pending",
  });
});
```

(다른 테스트는 그대로 둔다.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/after-signup.test.ts`
Expected: FAIL — `messages` 가 3, `message_jobs` 길이 3 (아직 옛 로직).

- [ ] **Step 3: Update implementation**

`lib/after-signup.ts` 를 수정한다.

(a) 파일 상단 import 에 추가:

```ts
import { MESSAGE_TEMPLATES, buildJobRow } from "./messages";
```

(b) 기존 `MESSAGE_TEMPLATES`(로컬 상수, 1/3/7일 배열)와 `DAY_MS` 상수를 **삭제**한다.

(c) 함수 하단의 1/3/7일 예약 블록:

```ts
  // 1/3/7일 메시지 예약
  const rows = MESSAGE_TEMPLATES.map((t) => ({
    user_id: userId,
    channel: "kakao",
    template_key: t.template_key,
    message: t.message,
    scheduled_at: new Date(now.getTime() + t.day * DAY_MS).toISOString(),
    status: "pending",
  }));
  await db.from("message_jobs").insert(rows);

  return { granted, referred, messages: rows.length };
```

을 아래로 교체:

```ts
  // 가입 즉시 발송 메시지 1건 예약
  await db
    .from("message_jobs")
    .insert(buildJobRow(userId, MESSAGE_TEMPLATES.signup_done, now));

  return { granted, referred, messages: 1 };
```

주석 `/** 가입 후 예약할 1/3/7일 메시지 (PRD 9.7) */` 는 제거하거나 `/** 가입 즉시 발송 메시지 */` 로 갱신한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/after-signup.test.ts`
Expected: PASS (모든 테스트).

- [ ] **Step 5: Commit**

```bash
git add lib/after-signup.ts lib/after-signup.test.ts
git commit -m "feat: 가입 즉시 signup_done 알림톡 예약(1/3/7일 시퀀스 대체)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 결제 시 `purchase_thanks`(now) + `usage_checkin_d1`(now+24h) 예약

**Files:**
- Modify: `lib/payment.ts`
- Test: `lib/payment.test.ts`

**Interfaces:**
- Consumes: `MESSAGE_TEMPLATES`, `buildJobRow` (Task 1).
- Produces: `DemoPaymentOptions` 에 선택 필드 `now?: Date` 추가(테스트 결정성). 반환 타입 불변.

- [ ] **Step 1: Update the failing test**

`lib/payment.test.ts` 수정:

(a) `makeDb()` 의 `store` 에 `message_jobs: []` 추가:

```ts
    point_events: [],
    message_jobs: [],
```

(b) `QB.insert` 를 배열도 지원하도록 교체:

```ts
    insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const inserted = rows.map((r, i) => ({
        id: `${this.table}_${store[this.table].length + i}`,
        ...r,
      }));
      store[this.table].push(...inserted);
      const thenable = {
        then: (res: (v: unknown) => void) => res({ data: inserted, error: null }),
        select: () => ({ single: async () => ({ data: inserted[0], error: null }) }),
      };
      return thenable;
    }
```

(c) 새 테스트 추가(파일 하단):

```ts
test("runDemoPayment 은 결제 즉시 감사 + 1일후 점검 메시지를 예약한다", async () => {
  const { db, store } = makeDb();
  const now = new Date("2026-07-09T00:00:00.000Z");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await runDemoPayment(db as any, { userId: "u1", consultationId: "c1", now });

  expect(store.message_jobs).toHaveLength(2);
  const byKey = Object.fromEntries(
    store.message_jobs.map((j) => [j.template_key, j])
  );
  expect(byKey.purchase_thanks.scheduled_at).toBe("2026-07-09T00:00:00.000Z");
  expect(byKey.usage_checkin_d1.scheduled_at).toBe("2026-07-10T00:00:00.000Z");
  expect(byKey.purchase_thanks.status).toBe("pending");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payment.test.ts`
Expected: FAIL — `message_jobs` 가 비어 있음(아직 예약 로직 없음).

- [ ] **Step 3: Update implementation**

`lib/payment.ts` 수정.

(a) import 추가:

```ts
import { MESSAGE_TEMPLATES, buildJobRow } from "./messages";
```

(b) `DemoPaymentOptions` 에 `now?: Date` 추가:

```ts
export interface DemoPaymentOptions {
  userId: string;
  consultationId: string;
  now?: Date;
}
```

(c) `DAY_MS` 상수 추가(파일 상단, `DEMO_AMOUNT` 근처):

```ts
const DAY_MS = 24 * 60 * 60 * 1000;
```

(d) 함수 본문 수정 — 시그니처 구조분해에 `now` 추가하고 `paidAt` 를 `now` 기준으로:

```ts
export async function runDemoPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient | any,
  { userId, consultationId, now = new Date() }: DemoPaymentOptions
): Promise<DemoPaymentResult> {
  const paidAt = now.toISOString();
```

(e) 함수 끝의 `return { tier: "paid" };` **직전**에 예약 삽입 추가:

```ts
  // 결제 즉시 감사 + 1일 후 사용 점검 메시지 예약
  await db.from("message_jobs").insert([
    buildJobRow(userId, MESSAGE_TEMPLATES.purchase_thanks, now),
    buildJobRow(userId, MESSAGE_TEMPLATES.usage_checkin_d1, new Date(now.getTime() + DAY_MS)),
  ]);

  return { tier: "paid" };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/payment.test.ts`
Expected: PASS (기존 + 신규 테스트).

- [ ] **Step 5: Commit**

```bash
git add lib/payment.ts lib/payment.test.ts
git commit -m "feat: 결제 시 구매감사(즉시)+사용점검(+1일) 알림톡 예약

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 가입/결제 라우트에 인라인 즉시 발송 연결

**Files:**
- Modify: `app/api/auth/after-signup/route.ts`
- Modify: `app/api/payments/demo/route.ts`

**Interfaces:**
- Consumes: `dispatchDueMessages(admin)` (Task 2). 발송 실패는 삼켜서(try/catch) 가입/결제 응답에 영향 없음.

- [ ] **Step 1: after-signup 라우트에 인라인 dispatch 추가**

`app/api/auth/after-signup/route.ts`:

(a) import 추가:

```ts
import { dispatchDueMessages } from "@/lib/dispatch";
```

(b) `const result = await runAfterSignup(admin, { userId: user.id, refCode });` 다음 줄에 추가:

```ts
  // 가입 즉시 발송분 flush — 실패해도 가입 응답은 성공 처리
  try {
    await dispatchDueMessages(admin);
  } catch (e) {
    console.error("[코치링] 가입 즉시 발송 실패:", e);
  }
```

- [ ] **Step 2: payments/demo 라우트에 인라인 dispatch 추가**

`app/api/payments/demo/route.ts`:

(a) import 추가:

```ts
import { dispatchDueMessages } from "@/lib/dispatch";
```

(b) `const result = await runDemoPayment(admin, { userId: user.id, consultationId });` 다음 줄에 추가:

```ts
  // 결제 즉시 발송분(purchase_thanks) flush — 실패해도 결제 응답은 성공 처리
  try {
    await dispatchDueMessages(admin);
  } catch (e) {
    console.error("[코치링] 결제 즉시 발송 실패:", e);
  }
```

- [ ] **Step 3: Verify types, lint, full tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint app/api/auth/after-signup/route.ts app/api/payments/demo/route.ts && npm test`
Expected: no type/lint errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/after-signup/route.ts app/api/payments/demo/route.ts
git commit -m "feat: 가입/결제 직후 알림톡 즉시 발송(dispatch flush)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 환경변수 예시 갱신

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: 템플릿 env 키 교체**

`.env.local.example` 하단의 세 줄:

```
SOLAPI_TEMPLATE_WELCOME_D1=
SOLAPI_TEMPLATE_REMIND_D3=
SOLAPI_TEMPLATE_EXPIRE_D7=
```

을 아래로 교체:

```
# template_key → 승인된 알림톡 templateId. 있는 것만 알림톡, 없으면 해당 건은 SMS.
SOLAPI_TEMPLATE_SIGNUP_DONE=        # 가입 즉시: 회원가입 완료 안내
SOLAPI_TEMPLATE_PURCHASE_THANKS=   # 결제 즉시: 결제 완료/구매 감사
SOLAPI_TEMPLATE_USAGE_CHECKIN_D1=  # 결제 +1일: 이용 안내(심사 정보성 문구 주의)
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: 이벤트 알림톡 템플릿 env 키 예시 갱신

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (완료됨)

**1. Spec coverage:**
- 3종 메시지/시점 → Task 1(카탈로그), Task 4(signup_done), Task 5(purchase_thanks·usage_checkin_d1). ✓
- 발송 로직 추출 → Task 2. ✓
- 세 호출처 공용(크론/가입/결제) → Task 3, Task 6. ✓
- 기존 1/3/7일 시퀀스 제거 → Task 4. ✓
- 즉시 발송(기록 후 워커 1회 호출) → Task 6. ✓
- 폴백(데모/SMS/번호없음/service_role) → Task 2 로직 + Task 3 가드에서 보존. ✓
- 에러 격리(발송 실패 ≠ 가입/결제 실패) → Task 6 try/catch. ✓
- 테스트 갱신 → Task 1/2/4/5. ✓
- env 예시 → Task 7. ✓
- 수작업 항목(콘솔/심사/크론) → 스펙 문서 "수작업 항목"에 기재(코드 태스크 아님, 사용자 안내로 처리). ✓

**2. Placeholder scan:** 모든 코드 스텝에 실제 코드/명령/기대출력 포함. TBD 없음. ✓

**3. Type consistency:** `MESSAGE_TEMPLATES`(record), `buildJobRow(userId, template, scheduledAt)`, `dispatchDueMessages(admin, deps)` → `{mode,sent,failed}`, `DemoPaymentOptions.now?` 가 Task 전반에서 일치. `usage_checkin_d1`/`purchase_thanks`/`signup_done` 키 표기 일관. ✓

## 주의: 후속 과제(범위 밖)
- `runDemoPayment` 은 멱등 가드가 없어 중복 결제 호출 시 결제 메시지가 중복 예약될 수 있음(스펙 6절). 실결제 연동 시 결제 승인 검증과 함께 가드 추가.
