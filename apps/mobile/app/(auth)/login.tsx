import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { HealthCheckResponse } from "@ewm/shared-types";

// Use your machine's LAN IP here when testing on a physical device via
// Expo Go, e.g. http://192.168.1.23:3001 — "localhost" only works in an
// emulator running on the same host as the API.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginScreen() {
  const [status, setStatus] = useState<"checking" | "ok" | "error">(
    "checking",
  );

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data: HealthCheckResponse) => {
        setStatus(data.status === "ok" ? "ok" : "error");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Employee Work Management</Text>
      <Text style={styles.subtitle}>Phase 1 scaffold — login form lands in Phase 2</Text>
      <Text style={styles.status}>
        API connectivity:{" "}
        {status === "checking" ? "checking…" : status === "ok" ? "OK" : "unreachable"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center" },
  status: { fontSize: 14, marginTop: 16 },
});
