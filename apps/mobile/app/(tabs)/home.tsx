import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today's Work</Text>
      <Text style={styles.subtitle}>
        Task list lands in Phase 12, once auth (Phase 2) and tasks (Phase 6)
        are in place.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "600" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 8 },
});
