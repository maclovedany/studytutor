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
- `.env.example`는 루트 `.gitignore`의 `.env*` 정책으로 저장소에 커밋되지 않는다. 로컬에서 아래 값으로 직접 만든다:
  ```
  EXPO_PUBLIC_SUPABASE_URL=
  EXPO_PUBLIC_SUPABASE_ANON_KEY=
  ```

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
