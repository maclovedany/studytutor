# Expo 앱 (포인트 조회 + 카카오 로그인 + AdMob) — 설계

작성일: 2026-07-10

## 배경 / 목표

4회차 커리큘럼의 모바일 확장. 웹 MVP가 이미 만든 데이터를 **Expo 앱**에서도 조회한다(PRD 9.12), 그리고 앱 수익화를 위한 **AdMob 구조**를 이해·스캐폴딩한다(PRD 9.13).

### 현재 상태 (탐색 결과)
웹 쪽 4회차 흐름(상담예약 + Zoom 딥링크 + 15분 타이머 + 결제 유도 모달 + 데모결제 + 유료전환)은 **이미 완성**되어 있다. 따라서 이번 작업은 **모바일 신규 구축**에 한정한다:
- `expo`/`react-native`/`admob` 관련 코드·의존성 전무(완전 신규).
- 포인트는 현재 서버 컴포넌트(`app/points/page.tsx` + `lib/points.ts` `sumPoints`)로만 읽고, 외부 클라이언트용 JSON API는 없음.

### 확정된 결정
- 앱 위치: **같은 리포 `mobile/` 폴더**.
- 데이터 접근: **Supabase 클라이언트 직접**(새 웹 API 없음). `point_events` RLS가 본인 행만 허용.
- 로그인: **카카오 OAuth**(웹과 동일 provider), 앱은 딥링크 리다이렉트.
- AdMob: **테스트 배너 스캐폴딩**(라이브러리 + config plugin + 테스트 ID 배너 + 문서).
- 웹은 변경하지 않음. 미사용 status(`payment_required`/`paid`/`completed`) 정리는 범위 밖.

## 비목표 (Out of scope)
- 실제 AdMob 광고 수익화(실 광고 단위 ID, 실광고 노출) — 후속 과제. 테스트 광고까지만.
- 앱 전체 기능(상담/결제 등) — **포인트 조회 화면까지만**(PRD MVP 범위).
- react-navigation 등 라우팅 라이브러리 — 조건부 렌더로 대체.
- 웹의 상담 status 상태머신 보완.
- 이메일+비번 로그인(카카오 OAuth로 확정).

## 아키텍처

### 큰 그림 — 웹과 앱이 하나의 Supabase 공유
```
웹(Next.js, 완성): 상담/타이머/결제 → profiles.tier, point_events 갱신
                         │  같은 DB · 같은 RLS
모바일(Expo, 신규): supabase-js 로그인 → point_events 조회(RLS) → sumPoints → 화면 + AdMob 배너
```
앱을 위한 백엔드를 새로 만들지 않는다. anon key만 앱에 포함(공개용), 데이터 보호는 RLS가 담당. service_role 키는 앱에 절대 포함 금지.

### 파일 구조 (`mobile/`)
```
mobile/
  app.json               # scheme: "coachring", plugins: react-native-google-mobile-ads
  package.json
  tsconfig.json
  babel.config.js
  App.tsx                # onAuthStateChange 세션 게이트 (session ? Points : Login)
  lib/supabase.ts        # supabase-js (PKCE, AsyncStorage 저장소, detectSessionInUrl:false)
  lib/points.ts          # sumPoints — 웹 lib/points.ts 규칙 이식(이벤트 points 합)
  lib/points.test.ts     # sumPoints 단위 테스트 (오프라인 검증 가능)
  screens/LoginScreen.tsx    # "카카오로 시작하기" 버튼 → OAuth 흐름
  screens/PointsScreen.tsx   # 총 포인트 + 이벤트 목록 + 로그아웃 + <AdBanner/>
  components/AdBanner.tsx     # TestIds.BANNER 배너
  .env.example           # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
  README.md              # 실행·EAS·AdMob·리다이렉트 설정 안내
```

### 의존성
- 런타임: `expo`, `react`, `react-native`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `expo-web-browser`, `expo-linking`, `react-native-google-mobile-ads`.
- 개발: `typescript`, `@types/react`, `vitest`(sumPoints 테스트용, RN 런타임 불필요한 순수 함수만).
- 버전은 `npx expo install --fix`로 SDK 정합성 맞추도록 README에 안내(이 환경에서 실행/네트워크 설치 불가).

### 카카오 OAuth 흐름
```
LoginScreen:
  const redirectTo = Linking.createURL("auth")            // coachring://auth
  const { data } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo, skipBrowserRedirect: true },
  })
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  // res.url 에서 code 추출 → supabase.auth.exchangeCodeForSession(code)
App.tsx: supabase.auth.onAuthStateChange 로 세션 감지 → 화면 전환
```
- Supabase 클라이언트: `auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: "pkce" }`.
- `react-native-url-polyfill/auto` import로 RN의 URL 파싱 보완.

### 포인트 화면
- 조회: `supabase.from("point_events").select("*").order("created_at", { ascending: false })` — RLS가 본인 행만 반환.
- 합계: `sumPoints(events)`(웹과 동일 규칙, `points` 필드 합).
- 렌더: 총 포인트 강조 + FlatList(정책/포인트/일시) + 로그아웃 버튼 + 하단 `<AdBanner/>`.
- 로그아웃: `supabase.auth.signOut()` → App.tsx가 Login 으로.

### AdBanner
- `import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads"`.
- `unitId={TestIds.BANNER}` (항상 테스트 광고 — 정책 위반 방지).
- Expo Go 미지원(네이티브 SDK) → Development/EAS Build 필요. README에 명시하고, 컴포넌트는 로드 실패해도 앱이 죽지 않도록 방어(try/catch 또는 조건 렌더).

## 에러 / 엣지 처리
- Supabase 미설정(env 없음) → LoginScreen에 안내 문구, 크래시 방지.
- OAuth 취소/실패 → 에러 메시지 표시, Login 유지.
- 포인트 0건/조회 실패 → "0P" 또는 에러 문구.
- AdMob 네이티브 모듈 부재(Expo Go) → 배너 미표시로 폴백(앱 정상 동작).

## 테스트 / 검증
- **자동(가능)**: `mobile/`에서 `npx tsc --noEmit` 타입체크 + `sumPoints` vitest 단위 테스트.
- **수동(사용자)**: `npx expo start` 실기기/시뮬레이터 실행, dev build로 AdMob 확인. 이 환경엔 모바일 런타임이 없어 자동 실행 불가.

## 수작업 항목 (코드 밖 콘솔/빌드)
1. **Supabase Auth** → Authentication > URL Configuration > Redirect URLs에 `coachring://auth` 추가.
2. **카카오 developers** → 앱 플랫폼/리다이렉트 URI에 앱 스킴 등록(Supabase 콜백과 연동).
3. **AdMob** → 계정 생성, 앱 등록, 실제 광고 단위 ID 발급(후속), EAS Build 실행.
4. **env** → `mobile/.env` 에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`(웹과 같은 프로젝트 값).
5. **실행/빌드** → `cd mobile && npm install && npx expo install --fix && npx expo start`. AdMob은 `eas build` 또는 dev client 필요.

## 후속 과제 (범위 밖)
- 실제 AdMob 광고 단위/수익화, Google 정책 준수.
- 앱 내 상담/결제 등 전체 기능 확장.
- 이메일+비번 등 대체 로그인.
