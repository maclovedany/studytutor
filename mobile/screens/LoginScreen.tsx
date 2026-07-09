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
