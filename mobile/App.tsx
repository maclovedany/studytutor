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
