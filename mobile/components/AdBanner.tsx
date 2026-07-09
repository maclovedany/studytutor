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
