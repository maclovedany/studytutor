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
