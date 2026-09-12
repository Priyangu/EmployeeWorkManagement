import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type {
  CreateTaskRequest,
  EmployeeResponse,
  ProjectResponse,
  TaskPriority,
  TaskResponse,
} from "@ewm/shared-types";
import { apiFetch, logout } from "../../lib/api";
import { getSessionUser, type SessionUser } from "../../lib/session";

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function ManageTasksScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const session = await getSessionUser();
    setUser(session);
    const [taskList, empList, projList] = await Promise.all([
      apiFetch<TaskResponse[]>("/tasks"),
      apiFetch<EmployeeResponse[]>("/employees"),
      apiFetch<ProjectResponse[]>("/projects"),
    ]);
    setTasks(taskList);
    setEmployees(empList);
    setProjects(projList);
    if (projList.length > 0) setProjectId(projList[0].id);
  }, []);

  useEffect(() => {
    void load()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function submitTask() {
    setError(null);
    if (!title.trim() || !projectId) {
      setError("Title and project are required");
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateTaskRequest = {
        title: title.trim(),
        projectId,
        priority,
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
      };
      await apiFetch("/tasks", { method: "POST", body: JSON.stringify(payload) });
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setAssigneeId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Task Management</Text>
        <TouchableOpacity onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.sectionTitle}>Create Task</Text>
      <TextInput
        style={styles.input}
        placeholder="Task title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Project</Text>
      <FlatList
        horizontal
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, projectId === item.id && styles.chipActive]}
            onPress={() => setProjectId(item.id)}
          >
            <Text style={[styles.chipText, projectId === item.id && styles.chipTextActive]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Text style={styles.label}>Priority</Text>
      <FlatList
        horizontal
        data={PRIORITIES}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, priority === item && styles.chipActive]}
            onPress={() => setPriority(item)}
          >
            <Text style={[styles.chipText, priority === item && styles.chipTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Text style={styles.label}>Assign to</Text>
      <FlatList
        horizontal
        data={employees.filter((e) => e.employmentStatus === "ACTIVE")}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, assigneeId === item.id && styles.chipActive]}
            onPress={() => setAssigneeId(item.id)}
          >
            <Text style={[styles.chipText, assigneeId === item.id && styles.chipTextActive]}>
              {item.name} {item.role === "TEAM_LEAD" ? "(Lead)" : ""}
            </Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={() => void submitTask()}
        disabled={submitting}
      >
        <Text style={styles.submitText}>
          {submitting ? "Creating..." : "Create Task"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>
        {tasks.length} task{tasks.length === 1 ? "" : "s"}
      </Text>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({ pathname: "/task/[id]", params: { id: item.id } })
            }
          >
            <View style={styles.row}>
              <Text style={styles.taskTitle}>{item.title}</Text>
              <Text style={[styles.badge, item.status === "COMPLETED" && styles.done]}>
                {item.status.replace(/_/g, " ")}
              </Text>
            </View>
            <Text style={styles.meta}>
              {item.projectName} · {item.priority}
              {item.assigneeName ? ` · ${item.assigneeName}` : ""}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 22, backgroundColor: "#f5f7f4" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { color: "#17324d", fontSize: 28, fontWeight: "800" },
  signOut: { color: "#17324d", fontWeight: "700" },
  sectionTitle: {
    color: "#17202a",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 15,
  },
  label: { color: "#68737d", fontSize: 12, fontWeight: "700", marginTop: 8, marginBottom: 6 },
  chip: {
    backgroundColor: "#e8ecf1",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipActive: { backgroundColor: "#e8654f" },
  chipText: { color: "#17324d", fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  submitBtn: {
    backgroundColor: "#17324d",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#17202a",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  taskTitle: { flex: 1, color: "#17202a", fontSize: 16, fontWeight: "800" },
  badge: { color: "#1565c0", fontSize: 11, fontWeight: "800" },
  done: { color: "#2e7d32" },
  meta: { color: "#68737d", marginTop: 8 },
  error: { color: "#c62828", marginBottom: 12 },
});