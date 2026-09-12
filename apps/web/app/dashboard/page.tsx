"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardTodayResponse, EmployeeResponse, OrganisationResponse, TaskResponse } from "@ewm/shared-types";
import { apiFetch } from "../../lib/api";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { Nav } from "../../lib/nav";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [today, setToday] = useState<DashboardTodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organisations, setOrganisations] = useState<OrganisationResponse[]>([]);
  const [managers, setManagers] = useState<EmployeeResponse[]>([]);
  const [teamEmployees, setTeamEmployees] = useState<EmployeeResponse[]>([]);
  const [allEmployees, setAllEmployees] = useState<EmployeeResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser || !getAccessToken()) { void router.replace("/login"); return; }
    setUser(sessionUser);
    if (sessionUser.role === "SUPER_ADMIN") {
      void apiFetch<OrganisationResponse[]>("/organisations").then(setOrganisations).catch((err) => setError(err instanceof Error ? err.message : "Failed to load tenants"));
      return;
    }
    if (sessionUser.role === "ORG_ADMIN") {
      void apiFetch<EmployeeResponse[]>("/employees").then((list) => setManagers(list.filter((e) => e.role === "MANAGER"))).catch((err) => setError(err instanceof Error ? err.message : "Failed to load managers"));
      return;
    }
    if (sessionUser.role === "TEAM_LEAD") {
      void Promise.all([
        apiFetch<EmployeeResponse[]>("/employees").then(setTeamEmployees),
        apiFetch<TaskResponse[]>("/tasks").then(setTasks),
      ]).catch((err) => setError(err instanceof Error ? err.message : "Failed to load team"));
      return;
    }
    if (sessionUser.role === "MANAGER") {
      void Promise.all([
        apiFetch<EmployeeResponse[]>("/employees").then(setAllEmployees),
        apiFetch<TaskResponse[]>("/tasks").then(setTasks),
      ]).catch((err) => setError(err instanceof Error ? err.message : "Failed to load data"));
      return;
    }
    void apiFetch<DashboardTodayResponse>("/dashboard/today").then(setToday).catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, [router]);

  function handleLogout() { clearSession(); void router.push("/login"); }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <Nav user={user} onLogout={handleLogout} />
      <h1>Dashboard</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {user?.role === "SUPER_ADMIN" && (
        <section>
          <h2>Tenant administrators</h2>
          <p>Platform instance owners across all companies.</p>
          {organisations.length === 0 ? (<p>No tenants found.</p>) : organisations.map((org) => (
            <article key={org.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 10 }}>
              <strong>{org.name}</strong>
              <div>{org.country} · {org.timeZone} · {org.status}</div>
            </article>
          ))}
        </section>
      )}
      {user?.role === "ORG_ADMIN" && (
        <section>
          <h2>Managers</h2>
          <p>Managers in your organisation. <a href="/employees">Manage all people</a>.</p>
          {managers.length === 0 ? (<p>No managers yet — <a href="/employees">add your first manager</a>.</p>) : managers.map((m) => (
            <article key={m.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <strong>{m.name}</strong> · {m.email}
            </article>
          ))}
        </section>
      )}
      {user?.role === "TEAM_LEAD" && (
        <>
          <section>
            <h2>Your team</h2>
            {teamEmployees.length === 0 ? (<p>No team members yet.</p>) : teamEmployees.map((e) => (
              <article key={e.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <strong>{e.name}</strong> · {e.role} · {e.email}
              </article>
            ))}
          </section>
          <section>
            <h2>Team tasks</h2>
            {tasks.length === 0 ? (<p>No tasks assigned to your team.</p>) : tasks.map((t) => (
              <article key={t.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <strong>{t.title}</strong> · {t.status} · {t.assigneeName ?? "Unassigned"}
              </article>
            ))}
            <p><a href="/tasks">View all tasks</a></p>
          </section>
        </>
      )}
      {user?.role === "MANAGER" && (
        <>
          <section>
            <h2>Team members</h2>
            <p>All team leads and employees in your organisation. <a href="/employees">Manage people</a>.</p>
            {allEmployees.length === 0 ? (<p>No employees yet.</p>) : allEmployees.map((e) => (
              <article key={e.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <strong>{e.name}</strong> · {e.role} · {e.teamName ?? "No team"} · {e.email}
              </article>
            ))}
          </section>
          <section>
            <h2>All tasks</h2>
            <p><a href="/tasks">Create, assign, and manage tasks</a>.</p>
            {tasks.length === 0 ? (<p>No tasks yet.</p>) : tasks.map((t) => (
              <article key={t.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <strong>{t.title}</strong> · {t.status} · {t.assigneeName ?? "Unassigned"}
              </article>
            ))}
          </section>
        </>
      )}
      {user?.role === "EMPLOYEE" && today && (
        <>
          <p>Welcome, <strong>{user.email}</strong>. Today: {today.date}.</p>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "24px 0" }}>
            {[["Employees working", today.employeesWorking], ["Tasks scheduled", today.tasksScheduled], ["Tasks completed", today.tasksCompleted], ["Overdue", today.overdueTasks], ["Active tasks", today.activeTasks]].map(([label, value]) => (
              <article key={String(label)} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                <div style={{ color: "#666", fontSize: 14 }}>{label}</div>
                <strong style={{ fontSize: 32 }}>{value}</strong>
              </article>
            ))}
          </section>
          <section>
            <h2>Team management</h2>
            <p><a href="/employees">Employees</a> · <a href="/teams">Teams</a> · <a href="/schedule">Schedule</a></p>
          </section>
        </>
      )}
    </main>
  );
}
