"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeResponse, ProjectResponse, TaskCategoryResponse, TaskPriority, TaskResponse, TaskStatus } from "@ewm/shared-types";
import { apiFetch } from "../../lib/api";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { Nav } from "../../lib/nav";

const MANAGER_ROLES = ["ORG_ADMIN", "MANAGER", "TEAM_LEAD"];
const statuses: TaskStatus[] = ["NOT_STARTED", "SCHEDULED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED", "BLOCKED"];
const priorities: TaskPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

function statusColor(status: string) {
  return { COMPLETED: "#2e7d32", IN_PROGRESS: "#1565c0", PAUSED: "#ed6c02", CANCELLED: "#757575", BLOCKED: "#c62828" }[status] ?? "#616161";
}

export default function TasksPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [categories, setCategories] = useState<TaskCategoryResponse[]>([]);
  const [status, setStatus] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [createAssigneeId, setCreateAssigneeId] = useState("");

  const loadTasks = useCallback(async () => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (assigneeId) query.set("assigneeId", assigneeId);
    setTasks(await apiFetch<TaskResponse[]>(`/tasks${query.toString() ? `?${query}` : ""}`));
  }, [assigneeId, status]);

  useEffect(() => {
    const session = getSessionUser();
    if (!session || !getAccessToken()) { void router.replace("/login"); return; }
    setUser(session);
    void Promise.all([
      loadTasks(),
      apiFetch<EmployeeResponse[]>("/employees").then(setEmployees),
      apiFetch<ProjectResponse[]>("/projects").then(setProjects),
      apiFetch<TaskCategoryResponse[]>("/task-categories").then(setCategories),
    ]).catch((err) => setError(err instanceof Error ? err.message : "Failed to load tasks")).finally(() => setLoading(false));
  }, [loadTasks, router]);

  const logout = () => { clearSession(); void router.push("/login"); };
  const canManage = user != null && MANAGER_ROLES.includes(user.role);
  const assigneeOptions = employees.filter((employee) => employee.employmentStatus === "ACTIVE");

  async function createTask(event: FormEvent) {
    event.preventDefault(); setError(null); setNotice(null); setBusy(true);
    try {
      await apiFetch("/tasks", { method: "POST", body: JSON.stringify({ projectId, title, priority, ...(categoryId ? { categoryId } : {}), ...(estimatedMinutes ? { estimatedMinutes: Number(estimatedMinutes) } : {}), ...(dueDate ? { dueDate: `${dueDate}T23:59:59.999Z` } : {}), ...(createAssigneeId ? { assigneeId: createAssigneeId } : {}) }) });
      await loadTasks(); setTitle(""); setEstimatedMinutes(""); setDueDate(""); setCreateAssigneeId(""); setNotice("Task created.");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create task"); }
    finally { setBusy(false); }
  }

  async function taskAction(path: string, body?: object, message = "Task updated.") {
    setError(null); setNotice(null); setBusy(true);
    try { await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) }); await loadTasks(); setNotice(message); }
    catch (err) { setError(err instanceof Error ? err.message : "Task action failed"); }
    finally { setBusy(false); }
  }

  if (!user || loading) return <main style={{ padding: 24 }}><Nav user={user} onLogout={logout} /><p>Loading tasks...</p></main>;
  return (
    <main className="task-page" style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <Nav user={user} onLogout={logout} />
      <h1>Tasks</h1>
      <p>Track work across your organisation, assign it to an employee or team lead, and follow each workflow status.</p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {notice && <p style={{ color: "green" }}>{notice}</p>}
      {canManage && <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 }}><h2 style={{ marginTop: 0 }}>Create task</h2><form onSubmit={(event) => void createTask(event)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}><label>Title<input required minLength={2} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Project<select required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Assign to<select value={createAssigneeId} onChange={(event) => setCreateAssigneeId(event.target.value)}><option value="">Unassigned</option>{assigneeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} {employee.role === "TEAM_LEAD" ? "(Team lead)" : ""}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label><label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">None</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Estimate (minutes)<input type="number" min="1" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label><label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><button type="submit" disabled={busy}>Create task</button></form></section>}
      <section><div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><h2 style={{ marginRight: "auto" }}>Task list</h2><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label><label>Assignee<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Everyone</option>{assigneeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label></div>{tasks.length === 0 ? <p>No tasks match these filters.</p> : <div style={{ display: "grid", gap: 10 }}>{tasks.map((task) => <article key={task.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}><div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}><div><strong>{task.title}</strong><div style={{ color: "#666", fontSize: 14 }}>{task.projectName} · {task.assigneeName ?? "Unassigned"}{task.dueDate ? ` · Due ${new Date(task.dueDate).toLocaleDateString()}` : ""}</div></div><span style={{ background: statusColor(task.status), color: "white", padding: "4px 10px", borderRadius: 12, fontSize: 12 }}>{task.status}</span></div>{task.description && <p>{task.description}</p>}<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}><span>{task.priority} · {task.estimatedMinutes ? `${task.estimatedMinutes} min` : "No estimate"}</span>{canManage && task.status !== "COMPLETED" && task.status !== "CANCELLED" && <select value={task.assigneeId ?? ""} onChange={(event) => void taskAction(`/tasks/${task.id}/assign`, { employeeId: event.target.value }, "Task assigned.")}><option value="">Assign task</option>{assigneeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} {employee.role === "TEAM_LEAD" ? "(Team lead)" : ""}</option>)}</select>}{task.status === "SCHEDULED" || task.status === "NOT_STARTED" ? <button type="button" disabled={busy} onClick={() => void taskAction(`/tasks/${task.id}/start`, {}, "Task started.")}>Start</button> : null}{task.status === "IN_PROGRESS" ? <button type="button" disabled={busy} onClick={() => void taskAction(`/tasks/${task.id}/pause`, {}, "Task paused.")}>Pause</button> : null}{task.status === "PAUSED" ? <button type="button" disabled={busy} onClick={() => void taskAction(`/tasks/${task.id}/resume`, {}, "Task resumed.")}>Resume</button> : null}{["IN_PROGRESS", "PAUSED"].includes(task.status) ? <button type="button" disabled={busy} onClick={() => void taskAction(`/tasks/${task.id}/complete`, {}, "Task completed.")}>Complete</button> : null}</div></article>)}</div>}</section>
    </main>
  );
}
