import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type {
  EmployeeResponse,
  OrganisationResponse,
  TaskResponse,
} from "@ewm/shared-types";
import { apiFetch, logout } from "../../lib/api";
import { getSessionUser, type SessionUser } from "../../lib/session";

const MANAGER_ROLES = ["ORG_ADMIN", "MANAGER", "TEAM_LEAD"];

function statusColor(status: string) {
  return (
    {
      COMPLETED: "#2e7d32",
      IN_PROGRESS: "#1565c0",
      PAUSED: "#ed6c02",
      CANCELLED: "#757575",
      BLOCKED: "#c62828",
    } as Record<string, string>
  )[status] ?? "#616161";
}

export default function HomeScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [organisations, setOrganisations] = useState<OrganisationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const session = await getSessionUser();
    setUser(session);
    if (!session) {
      setLoading(false);
      return;
    }
    try {
      if (session.role === "SUPER_ADMIN") {
        setOrganisations(await apiFetch<OrganisationResponse[]>("/organisations"));
      } else if (session.role === "ORG_ADMIN") {
        const all = await apiFetch<EmployeeResponse[]>("/employees");
        setEmployees(all.filter((e) => e.role === "MANAGER"));
      } else if (session.role === "TEAM_LEAD") {
        const [empList, taskList] = await Promise.all([
          apiFetch<EmployeeResponse[]>("/employees"),
          apiFetch<TaskResponse[]>("/tasks"),
        ]);
        setEmployees(empList);
        setTasks(taskList);
      } else if (session.role === "MANAGER") {
        const [empList, taskList] = await Promise.all([
          apiFetch<EmployeeResponse[]>("/employees"),
          apiFetch<TaskResponse[]>("/tasks"),
        ]);
        setEmployees(empList);
        setTasks(taskList);
      } else {
        setTasks(await apiFetch<TaskResponse[]>("/tasks"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!user) {
    return <View style={styles.center}><Text>Not signed in.</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Home</Text>
        <TouchableOpacity onPress={async () => { await logout(); router.replace("/(auth)/login"); }}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {user.role === "SUPER_ADMIN" && (<>
        <Text style={styles.sectionTitle}>{organisations.length} tenant{organisations.length === 1 ? "" : "s"}</Text>
        <FlatList data={organisations} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (<View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.meta}>{item.country} · {item.timeZone} · {item.status}</Text>
          </View>)}
        />
      </>)}
      {user.role === "ORG_ADMIN" && (<>
        <Text style={styles.sectionTitle}>Managers</Text>
        <FlatList data={employees} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (<View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.meta}>{item.email}</Text>
          </View>)}
        />
      </>)}
      {user.role === "TEAM_LEAD" && (<>
        <Text style={styles.sectionTitle}>Your team</Text>
        <FlatList data={employees} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (<View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.meta}>{item.role} · {item.email}</Text>
          </View>)}
        />
        <Text style={styles.sectionTitle}>Team tasks</Text>
        <FlatList data={tasks} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (<TouchableOpacity style={styles.card}
            onPress={() => router.push({ pathname: "/task/[id]", params: { id: item.id } })}>
            <View style={styles.row}><Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={[styles.badge, { color: statusColor(item.status) }]}>{item.status.replace(/_/g, " ")}</Text></View>
            <Text style={styles.meta}>{item.projectName} · {item.priority}{item.assigneeName ? ` · ${item.assigneeName}` : ""}</Text>
          </TouchableOpacity>)}
        />
      </>)}
      {user.role === "MANAGER" && (<>
        <Text style={styles.sectionTitle}>Team members ({employees.length})</Text>
        <FlatList data={employees} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (<TouchableOpacity style={styles.card}
            onPress={() => router.push({ pathname: "/task/[id]", params: { id: "new" } })}>
            <View style={styles.row}><Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.badge}>{item.role}</Text></View>
            <Text style={styles.meta}>{item.email}{item.teamName ? ` · ${item.teamName}` : ""}</Text>
          </TouchableOpacity>)}
        />
        <Text style={styles.sectionTitle}>All tasks ({tasks.length})</Text>
        {tasks.length === 0 ? (<Text>No tasks yet. Use the Tasks tab to create one.</Text>) : (
          <FlatList data={tasks} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (<TouchableOpacity style={styles.card}
              onPress={() => router.push({ pathname: "/task/[id]", params: { id: item.id } })}>
              <View style={styles.row}><Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={[styles.badge, { color: statusColor(item.status) }]}>{item.status.replace(/_/g, " ")}</Text></View>
              <Text style={styles.meta}>{item.projectName} · {item.priority}{item.assigneeName ? ` · ${item.assigneeName}` : ""}</Text>
            </TouchableOpacity>)}
          />
        )}
      </>)}
      {user.role === "EMPLOYEE" && (<>
        <Text style={styles.sectionTitle}>Your tasks</Text>
        {tasks.length === 0 ? (<Text>No tasks assigned to you.</Text>) : (
          <FlatList data={tasks} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (<TouchableOpacity style={styles.card}
              onPress={() => router.push({ pathname: "/task/[id]", params: { id: item.id } })}>
              <View style={styles.row}><Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={[styles.badge, { color: statusColor(item.status) }]}>{item.status.replace(/_/g, " ")}</Text></View>
              <Text style={styles.meta}>{item.projectName} · {item.priority}{item.dueDate ? ` · Due ${item.dueDate.slice(0, 10)}` : ""}</Text>
            </TouchableOpacity>)}
          />
        )}
      </>)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 22, backgroundColor: "#f5f7f4" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { color: "#17324d", fontSize: 28, fontWeight: "800" },
  signOut: { color: "#17324d", fontWeight: "700" },
  sectionTitle: { color: "#17202a", fontSize: 18, fontWeight: "800", marginTop: 16, marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, shadowColor: "#17202a", shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cardTitle: { flex: 1, color: "#17202a", fontSize: 16, fontWeight: "800" },
  badge: { fontSize: 11, fontWeight: "800" },
  meta: { color: "#68737d", marginTop: 8 },
  error: { color: "#c62828", marginBottom: 12 },
});