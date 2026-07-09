# Expo 포인트 조회 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mobile/` 폴더에 Expo 앱을 만들어 카카오 OAuth 로그인 후 사용자 포인트를 조회하고 AdMob 테스트 배너를 노출한다.

**Architecture:** 웹과 동일한 Supabase에 `supabase-js`로 직접 붙어 RLS로 본인 `point_events`만 조회한다. 새 백엔드/API는 만들지 않는다. 앱은 조건부 렌더(세션 있으면 Points, 없으면 Login)로 최소 구성한다.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-web-browser`, `expo-linking`, `react-native-google-mobile-ads`.

## Global Constraints

- **앱 위치는 `mobile/`**(같은 리포). 웹 코드(`app/`, `lib/`)는 수정하지 않는다.
- **루트 툴링에서 `mobile/`을 격리한다**: 루트 `tsconfig.json` `exclude`에 `mobile` 추가, 루트 eslint `globalIgnores`에 `mobile/**` 추가. (루트 vitest는 `include: ["lib/**/*.test.ts"]`라 mobile 미실행 — 변경 불필요.) 격리하지 않으면 루트 `tsc`/`next build`가 RN import에서 깨진다.
- **이 환경에선 모바일 런타임 실행 불가.** 자동 검증은 (a) 루트 `npm test`/`tsc`가 여전히 통과, (b) 순수 함수 `sumPoints`를 `npx vitest run --root mobile`로 검증하는 것까지. 실기기 실행은 사용자 몫.
- **anon key만 앱에 포함**(공개용, RLS가 보호). service_role 키는 앱에 절대 포함 금지.
- **AdMob은 항상 `TestIds.BANNER`**(테스트 광고)만 사용. 실 광고 단위는 후속.
- 패키지 버전은 최신 확인값으로 기입하되, 설치 후 `npx expo install --fix`로 SDK 정합성 재조정하도록 README에 안내.
- 딥링크 스킴: `coachring` → 리다이렉트 `coachring://auth`.

## File Structure

루트(격리용 수정):
- Modify: `tsconfig.json` — exclude에 `mobile`
- Modify: `eslint.config.mjs` — globalIgnores에 `mobile/**`

`mobile/`(신규):
- `package.json`, `tsconfig.json`, `babel.config.js`, `app.json`, `index.ts`, `.gitignore`, `.env.example`
- `vitest.config.ts` — 순수 함수 테스트용
- `lib/supabase.ts` — 클라이언트(PKCE+AsyncStorage)
- `lib/points.ts` + `lib/points.test.ts` — sumPoints(순수)
- `App.tsx` — 세션 게이트
- `screens/LoginScreen.tsx` — 카카오 OAuth
- `components/AdBanner.tsx` — 테스트 배너
- `screens/PointsScreen.tsx` — 포인트 목록 + 배너 + 로그아웃
- `README.md` — 실행/EAS/AdMob/리다이렉트 안내

---

## Task 1: 루트 툴링 격리 + mobile 스캐폴딩 설정

**Files:**
- Modify: `tsconfig.json`
- Modify: `eslint.config.mjs`
- Create: `mobile/package.json`, `mobile/tsconfig.json`, `mobile/babel.config.js`, `mobile/app.json`, `mobile/index.ts`, `mobile/.gitignore`, `mobile/.env.example`

**Interfaces:**
- Produces: 격리된 `mobile/` 프로젝트 골격. 이후 태스크가 이 안에 소스를 추가한다.

- [ ] **Step 1: 루트 tsconfig에서 mobile 제외**

`tsconfig.json`의 exclude 배열을 아래로 교체:

```json
  "exclude": ["node_modules", "mobile", "**/*.test.ts", "vitest.config.ts"]
```

- [ ] **Step 2: 루트 eslint에서 mobile 무시**

`eslint.config.mjs`의 `globalIgnores([...])` 목록에 `"mobile/**",` 를 추가:

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "mobile/**",
  ]),
```

- [ ] **Step 3: 루트 툴링이 여전히 정상인지 확인(mobile 빈 상태)**

Run: `npx tsc --noEmit -p tsconfig.json && npm test 2>&1 | tail -3`
Expected: tsc 무출력(exit 0), 테스트 41 passed.

- [ ] **Step 4: mobile/package.json 생성**

```json
{
  "name": "coachring-mobile",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "expo": "~57.0.4",
    "expo-linking": "~57.0.2",
    "expo-web-browser": "~57.0.0",
    "react": "19.2.0",
    "react-native": "0.86.0",
    "@supabase/supabase-js": "^2.110.2",
    "@react-native-async-storage/async-storage": "^2.1.0",
    "react-native-url-polyfill": "^2.0.0",
    "react-native-google-mobile-ads": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "~5.9.2",
    "@types/react": "~19.2.0",
    "vitest": "^4.1.9"
  },
  "private": true
}
```

주: 버전은 설치 후 `npx expo install --fix`로 SDK 57에 맞게 재조정한다(async-storage/url-polyfill 등이 조정될 수 있음).

- [ ] **Step 5: mobile/tsconfig.json 생성**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "jsx": "react-jsx"
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: mobile/babel.config.js 생성**

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
```

- [ ] **Step 7: mobile/app.json 생성 (AdMob config plugin + 테스트 App ID)**

```json
{
  "expo": {
    "name": "코치링",
    "slug": "coachring",
    "scheme": "coachring",
    "version": "1.0.0",
    "orientation": "portrait",
    "newArchEnabled": true,
    "ios": { "bundleIdentifier": "com.coachring.app", "supportsTablet": true },
    "android": { "package": "com.coachring.app" },
    "plugins": [
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-3940256099942544~3347511713",
          "iosAppId": "ca-app-pub-3940256099942544~1458002511"
        }
      ]
    ]
  }
}
```

주: 위 App ID 두 개는 Google 공식 **테스트 App ID**다. 실서비스 시 AdMob 콘솔의 실제 App ID로 교체.

- [ ] **Step 8: mobile/index.ts 생성 (엔트리)**

```ts
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
```

- [ ] **Step 9: mobile/.gitignore 생성**

```
node_modules/
.expo/
dist/
web-build/
*.log
.env
```

- [ ] **Step 10: mobile/.env.example 생성**

```
# 웹과 같은 Supabase 프로젝트 값 (anon key 는 공개용 — RLS 가 데이터 보호)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 11: Commit**

```bash
git add tsconfig.json eslint.config.mjs mobile/package.json mobile/tsconfig.json mobile/babel.config.js mobile/app.json mobile/index.ts mobile/.gitignore mobile/.env.example
git commit -m "chore(mobile): Expo 앱 스캐폴딩 + 루트 툴링 격리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: sumPoints 순수 함수 (오프라인 검증 가능)

**Files:**
- Create: `mobile/lib/points.ts`, `mobile/lib/points.test.ts`, `mobile/vitest.config.ts`

**Interfaces:**
- Produces: `sumPoints(events: { points: number }[]): number` — 이벤트 points 합. PointsScreen(Task 5)이 사용.

- [ ] **Step 1: mobile/vitest.config.ts 생성**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: 실패 테스트 작성 — mobile/lib/points.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { sumPoints } from "./points";

describe("sumPoints", () => {
  it("이벤트 points 합계를 반환한다", () => {
    expect(sumPoints([{ points: 1000 }, { points: 2000 }, { points: -500 }])).toBe(2500);
  });
  it("빈 배열은 0 을 반환한다", () => {
    expect(sumPoints([])).toBe(0);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run(리포 루트에서): `npx vitest run --root mobile`
Expected: FAIL — `Cannot find module './points'`.

- [ ] **Step 4: 구현 — mobile/lib/points.ts**

```ts
/** 포인트 이벤트 목록의 합계 = 총 포인트. (웹 lib/points.ts 와 동일 규칙, 잔액 컬럼 없음) */
export function sumPoints(events: { points: number }[]): number {
  return events.reduce((total, e) => total + e.points, 0);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run --root mobile`
Expected: PASS (2 tests).

- [ ] **Step 6: 루트 테스트 영향 없음 확인**

Run: `npm test 2>&1 | tail -3`
Expected: 여전히 41 passed (루트 vitest는 mobile 미포함).

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/points.ts mobile/lib/points.test.ts mobile/vitest.config.ts
git commit -m "feat(mobile): sumPoints 순수 함수 + 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Supabase 클라이언트 + 세션 게이트(App)

**Files:**
- Create: `mobile/lib/supabase.ts`, `mobile/App.tsx`

**Interfaces:**
- Produces: `supabase`(SupabaseClient) — LoginScreen/PointsScreen이 import. `App` 컴포넌트 — 엔트리(index.ts)가 렌더.
- Consumes: `LoginScreen`(Task 4), `PointsScreen`(Task 5) — 이 태스크 시점엔 아직 없으므로, App.tsx는 두 화면 import를 포함하되 두 파일은 Task 4/5에서 생성된다. **이 태스크 커밋 시점엔 App.tsx가 아직 미완성 import를 가지므로, Task 5 완료 후 전체가 성립한다**(모바일은 오프라인 타입체크 불가하니 순서상 허용).

- [ ] **Step 1: mobile/lib/supabase.ts 생성**

```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** 앱 전용 Supabase 클라이언트.
 *  - AsyncStorage 에 세션 저장(앱 재실행 시 로그인 유지)
 *  - RN 은 URL 리다이렉트 감지가 없으므로 detectSessionInUrl:false
 *  - OAuth 는 PKCE 흐름(code → exchangeCodeForSession) */
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

/** env 설정 여부 — 미설정 시 로그인 화면에서 안내. */
export const isSupabaseConfigured = Boolean(url && anonKey);
```

- [ ] **Step 2: mobile/App.tsx 생성**

```tsx
import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import LoginScreen from "./screens/LoginScreen";
import PointsScreen from "./screens/PointsScreen";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return session ? <PointsScreen /> : <LoginScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
```

- [ ] **Step 3: 루트 툴링 영향 없음 확인**

Run: `npx tsc --noEmit -p tsconfig.json && echo "root tsc ok"`
Expected: `root tsc ok`(mobile 제외되어 RN import로 깨지지 않음).

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/supabase.ts mobile/App.tsx
git commit -m "feat(mobile): Supabase 클라이언트 + 세션 게이트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: LoginScreen (카카오 OAuth)

**Files:**
- Create: `mobile/screens/LoginScreen.tsx`

**Interfaces:**
- Consumes: `supabase`, `isSupabaseConfigured` (Task 3).
- Produces: `LoginScreen`(default export) — App.tsx가 세션 없을 때 렌더.

- [ ] **Step 1: mobile/screens/LoginScreen.tsx 생성**

```tsx
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithKakao() {
    if (!isSupabaseConfigured) {
      setError("Supabase 환경변수가 설정되지 않았습니다(.env 확인).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const redirectTo = Linking.createURL("auth"); // coachring://auth
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthErr) throw oauthErr;
      if (!data.url) throw new Error("로그인 URL을 받지 못했습니다.");

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== "success") {
        return; // 사용자가 취소하거나 닫음
      }
      const code = new URL(res.url).searchParams.get("code");
      if (!code) throw new Error("인증 코드를 받지 못했습니다.");
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) throw exErr;
      // 성공 시 App.tsx 의 onAuthStateChange 가 PointsScreen 으로 전환
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>코치링</Text>
      <Text style={styles.sub}>포인트를 확인하려면 로그인하세요.</Text>
      <Pressable
        style={styles.kakao}
        onPress={signInWithKakao}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#191600" />
        ) : (
          <Text style={styles.kakaoText}>카카오로 시작하기</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#ffffff",
  },
  title: { fontSize: 32, fontWeight: "800", color: "#1e293b" },
  sub: { marginTop: 8, fontSize: 14, color: "#64748b" },
  kakao: {
    marginTop: 32,
    width: "100%",
    backgroundColor: "#FEE500",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  kakaoText: { fontSize: 16, fontWeight: "700", color: "#191600" },
  error: { marginTop: 16, color: "#dc2626", fontSize: 13, textAlign: "center" },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/screens/LoginScreen.tsx
git commit -m "feat(mobile): 카카오 OAuth 로그인 화면

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: AdBanner + PointsScreen

**Files:**
- Create: `mobile/components/AdBanner.tsx`, `mobile/screens/PointsScreen.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 3), `sumPoints` (Task 2), `AdBanner` (이 태스크).
- Produces: `PointsScreen`(default export) — App.tsx가 세션 있을 때 렌더.

- [ ] **Step 1: mobile/components/AdBanner.tsx 생성**

```tsx
// AdMob 은 네이티브 모듈이라 Expo Go 에선 로드되지 않는다.
// require 를 try/catch 로 감싸, 네이티브 모듈이 없으면(=Expo Go) 배너를 숨겨
// 앱이 크래시 없이 동작하도록 한다. Dev/EAS Build 에서만 실제 배너가 뜬다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { View, StyleSheet } from "react-native";

let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;
try {
  const ads = require("react-native-google-mobile-ads");
  BannerAd = ads.BannerAd;
  BannerAdSize = ads.BannerAdSize;
  TestIds = ads.TestIds;
} catch {
  // Expo Go: 네이티브 모듈 없음 → 배너 미표시
}

export default function AdBanner() {
  if (!BannerAd || !TestIds) return null;
  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={TestIds.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 8 },
});
```

- [ ] **Step 2: mobile/screens/PointsScreen.tsx 생성**

```tsx
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { supabase } from "../lib/supabase";
import { sumPoints } from "../lib/points";
import AdBanner from "../components/AdBanner";

interface PointRow {
  id: string;
  policy_key: string | null;
  points: number;
  created_at: string;
}

export default function PointsScreen() {
  const [rows, setRows] = useState<PointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: qErr } = await supabase
      .from("point_events")
      .select("id, policy_key, points, created_at")
      .order("created_at", { ascending: false });
    if (qErr) setError(qErr.message);
    else setRows((data as PointRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = sumPoints(rows);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>내 포인트</Text>
      <Text style={styles.total}>{total.toLocaleString()}P</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowKey}>{item.policy_key ?? "-"}</Text>
            <Text style={styles.rowPts}>
              {item.points > 0 ? "+" : ""}
              {item.points}P
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>아직 포인트 내역이 없어요.</Text>
        }
      />
      <AdBanner />
      <Pressable style={styles.logout} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64, backgroundColor: "#ffffff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { paddingHorizontal: 24, fontSize: 14, color: "#64748b" },
  total: {
    paddingHorizontal: 24,
    fontSize: 40,
    fontWeight: "800",
    color: "#1e293b",
  },
  list: { flex: 1, marginTop: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  rowKey: { fontSize: 14, color: "#334155" },
  rowPts: { fontSize: 14, fontWeight: "700", color: "#2563eb" },
  empty: { padding: 24, color: "#94a3b8", textAlign: "center" },
  error: { paddingHorizontal: 24, color: "#dc2626", fontSize: 13 },
  logout: { padding: 16, alignItems: "center" },
  logoutText: { color: "#64748b", fontSize: 14 },
});
```

- [ ] **Step 3: 루트 툴링 영향 없음 확인**

Run: `npx tsc --noEmit -p tsconfig.json && npm test 2>&1 | tail -3`
Expected: 루트 tsc 무출력(exit 0), 테스트 41 passed.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/AdBanner.tsx mobile/screens/PointsScreen.tsx
git commit -m "feat(mobile): 포인트 조회 화면 + AdMob 테스트 배너

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: README (실행/EAS/AdMob/리다이렉트 안내)

**Files:**
- Create: `mobile/README.md`

- [ ] **Step 1: mobile/README.md 생성**

````markdown
# 코치링 모바일 (Expo)

웹과 같은 Supabase에 붙어 포인트를 조회하는 Expo 앱. 카카오 OAuth 로그인 + AdMob 테스트 배너.

## 실행

```bash
cd mobile
npm install
npx expo install --fix          # SDK 57 정합성으로 버전 재조정
cp .env.example .env            # 값 채우기(웹과 같은 Supabase 프로젝트)
npx expo start
```

- `.env`의 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`는 웹과 동일 값(anon key는 공개용, RLS가 데이터 보호).

## 카카오 로그인 설정 (직접 해야 함)

1. **Supabase** → Authentication → URL Configuration → Redirect URLs에 `coachring://auth` 추가.
2. **카카오 developers** → 내 애플리케이션 → 앱 플랫폼/Redirect URI에 Supabase 콜백 및 앱 스킴 관련 설정 등록.
3. Supabase Auth Providers에서 Kakao가 활성화되어 있어야 함(웹과 동일 설정 공유).

## AdMob (테스트 배너 → 실광고)

- 코드의 배너는 항상 **테스트 광고**(`TestIds.BANNER`)라 그대로 실행 가능.
- **AdMob은 네이티브 모듈이라 Expo Go에서는 배너가 뜨지 않는다**(코드가 자동으로 숨김). 실제로 보려면 Development Build 또는 EAS Build 필요:
  ```bash
  npx expo install expo-dev-client
  eas build --profile development --platform android   # 또는 ios
  ```
- 실서비스: AdMob 계정 생성 → 앱 등록 → 실제 App ID를 `app.json`의 `androidAppId`/`iosAppId`에 교체 → 광고 단위 ID 발급 후 `TestIds.BANNER`를 실 단위 ID로 교체. Google 광고 정책 준수 필수.

## 검증

- 순수 함수 테스트: `npm test`(vitest, `sumPoints`).
- 타입체크: `npm run typecheck`(`npm install` 후).
- 실기기/시뮬레이터: `npx expo start` 후 Expo Go(로그인/포인트) 또는 dev build(+AdMob).

## 구조

```
App.tsx            세션 있으면 PointsScreen, 없으면 LoginScreen
lib/supabase.ts    supabase-js (PKCE + AsyncStorage)
lib/points.ts      sumPoints (웹과 동일 규칙)
screens/LoginScreen.tsx    카카오 OAuth
screens/PointsScreen.tsx   포인트 목록 + 로그아웃 + 배너
components/AdBanner.tsx     TestIds.BANNER 배너(Expo Go 폴백)
```
````

- [ ] **Step 2: Commit**

```bash
git add mobile/README.md
git commit -m "docs(mobile): 실행/EAS/AdMob/카카오 리다이렉트 안내

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (완료됨)

**1. Spec coverage:**
- Expo 앱 `mobile/` 생성 → Task 1. ✓
- Supabase 직접 연결(RLS) → Task 3. ✓
- 카카오 OAuth(딥링크/PKCE) → Task 4. ✓
- 포인트 조회 화면(sumPoints) → Task 2 + Task 5. ✓
- AdMob 테스트 배너 스캐폴딩(라이브러리+플러그인+배너) → Task 1(app.json 플러그인) + Task 5(배너). ✓
- 웹 미변경 → 어떤 태스크도 `app/`,`lib/` 수정 안 함. 루트 tsconfig/eslint만 격리 목적 수정. ✓
- 검증 한계/수작업 항목 → Task 6 README + 각 태스크의 루트 툴링 확인. ✓

**2. Placeholder scan:** 모든 파일 전체 코드 포함, 명령/기대출력 명시. TBD 없음. ✓

**3. Type/이름 일관성:** `sumPoints`, `supabase`, `isSupabaseConfigured`, `AdBanner`, `LoginScreen`, `PointsScreen`, 스킴 `coachring://auth`가 태스크 전반 일치. `point_events` 컬럼(id/policy_key/points/created_at)은 웹 스키마와 일치. ✓

## 주의(범위 밖/후속)
- 실제 AdMob 광고 단위·수익화, Google 정책 준수.
- 이 환경에서 모바일 런타임 실행/EAS Build 불가 — 실기기 검증은 사용자.
- 카카오 OAuth 리다이렉트(Supabase/카카오 콘솔) 등록은 수작업.
