"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardTodayResponse } from "@ewm/shared-types";
import { apiFetch } from "../../lib/api";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { Nav } from "../../lib/nav";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [today, setToday] = useState<DashboardTodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser || !getAccessToken()) {
      void router.replace("/login");
      return;
    }
    setUser(sessionUser);
    void apiFetch<DashboardTodayResponse>("/dashboard/today")
      .then(setToday)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, [router]);

  function handleLogout() {
    clearSession();
    void router.push("/login");
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <Nav user={user} onLogout={handleLogout} />
      <h1>Dashboard</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!user || !today ? <p>Loading dashboard...</p> : (
        <>
          <p>Welcome, <strong>{user.email}</strong>. Today: {today.date}.</p>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "24px 0" }}>
            {[
              ["Employees working", today.employeesWorking],
              ["Tasks scheduled", today.tasksScheduled],
              ["Tasks completed", today.tasksCompleted],
              ["Overdue", today.overdueTasks],
              ["Active tasks", today.activeTasks],
            ].map(([label, value]) => (
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
