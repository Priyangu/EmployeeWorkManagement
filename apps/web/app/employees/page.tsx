"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeResponse, TeamResponse } from "@ewm/shared-types";
import {
  clearSession,
  getAccessToken,
  getSessionUser,
  type SessionUser,
} from "../../lib/auth";
import { apiFetch } from "../../lib/api";

export default function EmployeesPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [teamId, setTeamId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canManage = user?.role === "ORG_ADMIN" || user?.role === "MANAGER";

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser || !getAccessToken()) {
      void router.replace("/login");
      return;
    }
    setUser(sessionUser);
    let cancelled = false;
    (async () => {
      try {
        const [empList, teamList] = await Promise.all([
          apiFetch<EmployeeResponse[]>("/employees"),
          apiFetch<TeamResponse[]>("/teams"),
        ]);
        if (!cancelled) {
          setEmployees(empList);
          setTeams(teamList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    clearSession();
    void router.push("/login");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<EmployeeResponse>("/employees", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          role,
          name,
          ...(teamId ? { teamId } : {}),
        }),
      });
      setEmployees((prev) => [...prev, created]);
      setNotice(`Added ${created.name} (${created.email}).`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      setTeamId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(emp: EmployeeResponse) {
    setError(null);
    setNotice(null);
    try {
      const path =
        emp.employmentStatus === "ACTIVE"
          ? `/employees/${emp.id}/disable`
          : `/employees/${emp.id}/enable`;
      const updated = await apiFetch<EmployeeResponse>(path, {
        method: "POST",
      });
      setEmployees((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
      setNotice(
        updated.employmentStatus === "ACTIVE"
          ? `Re-enabled ${updated.name}.`
          : `Disabled ${updated.name} - their login is blocked.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (!user) return null;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <h1>Employees</h1>
        <span style={{ color: "#666" }}>
          {user.email} ({user.role})
        </span>
        <span style={{ flex: 1 }} />
        <a href="/dashboard">Dashboard</a>
        <button type="button" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {notice && <p style={{ color: "green" }}>{notice}</p>}
      {loading && <p>Loading...</p>}

      {!loading && (
        <table
          cellPadding={8}
          style={{ borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Team</th>
              <th>Status</th>
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{emp.name}</td>
                <td>{emp.email ?? "-"}</td>
                <td>{emp.role ?? "-"}</td>
                <td>{emp.teamName ?? "-"}</td>
                <td>{emp.employmentStatus}</td>
                {canManage && (
                  <td>
                    <button
                      type="button"
                      onClick={() => void handleToggleStatus(emp)}
                    >
                      {emp.employmentStatus === "ACTIVE"
                        ? "Disable"
                        : "Enable"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5}>
                  No employees yet - add the first below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {canManage && (
        <section style={{ marginTop: 32, maxWidth: 480 }}>
          <h2>Add employee</h2>
          <form
            onSubmit={(e) => void handleCreate(e)}
            style={{ display: "grid", gap: 12 }}
          >
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                style={{ display: "block", width: "100%" }}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ display: "block", width: "100%" }}
              />
            </label>
            <label>
              Temporary password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                style={{ display: "block", width: "100%" }}
              />
            </label>
            <label>
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ display: "block", width: "100%" }}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="ORG_ADMIN">Org admin</option>
              </select>
            </label>
            <label>
              Team (optional)
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                style={{ display: "block", width: "100%" }}
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add employee"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
