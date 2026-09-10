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

export default function TeamsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canManage =
    user?.role === "ORG_ADMIN" || user?.role === "MANAGER";

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
        const [teamList, empList] = await Promise.all([
          apiFetch<TeamResponse[]>("/teams"),
          apiFetch<EmployeeResponse[]>("/employees"),
        ]);
        if (!cancelled) {
          setTeams(teamList);
          setEmployees(empList);
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
      const created = await apiFetch<TeamResponse>("/teams", {
        method: "POST",
        body: JSON.stringify({
          name,
          ...(managerId ? { managerId } : {}),
        }),
      });
      setTeams((prev) => [...prev, created]);
      setNotice(`Created team “${created.name}”`);
      setName("");
      setManagerId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading teams…</p>;

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Teams</h1>
      <p>
        Signed in as {user?.email} ({user?.role}).{" "}
        <a href="/dashboard">Dashboard</a> · <a href="/employees">Employees</a> ·{" "}
        <button type="button" onClick={handleLogout}>
          Sign out
        </button>
      </p>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
      {notice && <p style={{ color: "green" }}>{notice}</p>}

      {canManage && (
        <section>
          <h2>Create team</h2>
          <form onSubmit={handleCreate}>
            <label>
              Name{" "}
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>{" "}
            <label>
              Manager{" "}
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">— No manager —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>{" "}
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </button>
          </form>
        </section>
      )}

      <section>
        <h2>Teams ({teams.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Manager</th>
              <th>Members</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.managerName ?? "—"}</td>
                <td>{t.memberCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
