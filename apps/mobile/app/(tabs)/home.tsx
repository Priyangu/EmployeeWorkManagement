import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { EmployeeResponse, TaskResponse } from "@ewm/shared-types";
import { apiFetch, logout } from "../../lib/api";
import { getSessionUser, type SessionUser } from "../../lib/session";

export default function HomeScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { const session = await getSessionUser(); setUser(session); const employees = await apiFetch<EmployeeResponse[]>("/employees"); const employee = employees.find((item) => item.userId === session?.sub); if (!employee) throw new Error("No employee profile is linked to this account"); setTasks(await apiFetch<TaskResponse[]>(`/tasks?assigneeId=${employee.id}`)); }, []);
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load tasks")).finally(() => setLoading(false)); }, [load]);
  async function signOut() { await logout(); router.replace("/(auth)/login"); }
  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  return <View style={styles.container}><View style={styles.header}><View><Text style={styles.kicker}>TODAY'S WORK</Text><Text style={styles.title}>Good to see you</Text></View><TouchableOpacity onPress={() => void signOut()}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity></View>{error && <Text style={styles.error}>{error}</Text>}<Text style={styles.sectionTitle}>{tasks.length} assigned task{tasks.length === 1 ? "" : "s"}</Text><FlatList data={tasks} keyExtractor={(item) => item.id} contentContainerStyle={{ gap: 12, paddingBottom: 24 }} ListEmptyComponent={<Text style={styles.empty}>Nothing assigned yet. Your next task will appear here.</Text>} renderItem={({ item }) => <TouchableOpacity style={styles.card} onPress={() => router.push({ pathname: "/task/[id]", params: { id: item.id } })}><View style={styles.row}><Text style={styles.taskTitle}>{item.title}</Text><Text style={[styles.badge, item.status === "COMPLETED" && styles.done]}>{item.status.replace("_", " ")}</Text></View><Text style={styles.meta}>{item.projectName} · {item.priority}{item.dueDate ? ` · Due ${new Date(item.dueDate).toLocaleDateString()}` : ""}</Text></TouchableOpacity>} /></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, padding: 22, backgroundColor: "#f5f7f4" }, center: { flex: 1, justifyContent: "center", alignItems: "center" }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }, kicker: { color: "#e8654f", fontSize: 12, fontWeight: "800", letterSpacing: 1 }, title: { color: "#17324d", fontSize: 28, fontWeight: "800", marginTop: 5 }, signOut: { color: "#17324d", fontWeight: "700" }, sectionTitle: { color: "#17202a", fontSize: 18, fontWeight: "800", marginBottom: 12 }, card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, shadowColor: "#17202a", shadowOpacity: .07, shadowRadius: 10, elevation: 2 }, row: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, taskTitle: { flex: 1, color: "#17202a", fontSize: 16, fontWeight: "800" }, badge: { color: "#1565c0", fontSize: 11, fontWeight: "800" }, done: { color: "#2e7d32" }, meta: { color: "#68737d", marginTop: 8 }, empty: { color: "#68737d", textAlign: "center", marginTop: 30 }, error: { color: "#c62828", marginBottom: 12 } });
