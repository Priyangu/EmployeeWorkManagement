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
import { Nav } from "../../lib/nav";

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
  const [managerId, setManagerId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit modal state
  const [editing, setEditing] = useState<EmployeeResponse | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTeamId, setEditTeamId] = useState("");
  const [editManagerId, setEditManagerId] = useState("");
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyRelationship, setEditEmergencyRelationship] = useState("");
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");
  const [editEmergencyEmail, setEditEmergencyEmail] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const canManage = user?.role === "ORG_ADMIN" || user?.role === "MANAGER";

  const managerCandidates = employees.filter(
    (e) =>
      e.role === "MANAGER" ||
      e.role === "ORG_ADMIN" ||
      e.role === "TEAM_LEAD",
  );

  const creatableRoles =
    user?.role === "ORG_ADMIN"
      ? ["EMPLOYEE", "TEAM_LEAD", "MANAGER", "ORG_ADMIN"]
      : user?.role === "MANAGER"
        ? ["EMPLOYEE", "TEAM_LEAD"]
        : user?.role === "TEAM_LEAD"
          ? ["EMPLOYEE"]
          : [];

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
          ...(managerId ? { managerId } : {}),
        }),
      });
      setEmployees((prev) => [...prev, created]);
      setNotice(`Added ${created.name} (${created.email}).`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      setTeamId("");
      setManagerId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    setNotice(null);
    setEditSubmitting(true);
    try {
      const updated = await apiFetch<EmployeeResponse>(`/employees/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim() || undefined,
          teamId: editTeamId || undefined,
          managerId: editManagerId || undefined,
          emergencyContactName: editEmergencyName.trim() || undefined,
          emergencyContactRelationship: editEmergencyRelationship.trim() || undefined,
          emergencyContactPhone: editEmergencyPhone.trim() || undefined,
          emergencyContactEmail: editEmergencyEmail.trim() || undefined,
        }),
      });
      setNotice(`Updated ${updated.name}`);
      setEditing(null);
      setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update employee");
    } finally {
      setEditSubmitting(false);
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

  // Assign or change an employee's manager (uncontrolled per-row select, so
  // the current value is read from the form at submit time). Empty selection
  // sends null to clear the reporting line.
  async function handleAssignManager(
    event: FormEvent<HTMLFormElement>,
    emp: EmployeeResponse,
  ) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const formData = new FormData(event.currentTarget);
    const raw = String(formData.get("managerId") ?? "");
    const newManagerId = raw === "" ? null : raw;
    try {
      const updated = await apiFetch<EmployeeResponse>(`/employees/${emp.id}`, {
        method: "PATCH",
        body: JSON.stringify({ managerId: newManagerId }),
      });
      setEmployees((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
      setNotice(
        updated.managerName
          ? `${updated.name} now reports to ${updated.managerName}.`
          : `${updated.name} no longer has a manager assigned.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (!user) return null;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <Nav user={user} onLogout={handleLogout} />
      <h1>Employees</h1>

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
              <th>Manager</th>
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
                <td>
                  <span>{emp.managerName ?? "—"}</span>
                  {canManage && (
                    <form
                      onSubmit={(e) => void handleAssignManager(e, emp)}
                      style={{
                        display: "flex",
                        gap: 4,
                        alignItems: "center",
                        marginTop: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      <select
                        name="managerId"
                        defaultValue={emp.managerId ?? ""}
                        style={{ maxWidth: 160 }}
                        aria-label={`Change manager for ${emp.name}`}
                      >
                        <option value="">— None —</option>
                        {managerCandidates
                          .filter((c) => c.id !== emp.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.role})
                            </option>
                          ))}
                      </select>
                      <button type="submit">Change</button>
                    </form>
                  )}
                </td>
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
                <td colSpan={canManage ? 7 : 6}>
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
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} style={{ display: "block", width: "100%" }} />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ display: "block", width: "100%" }} />
            </label>
            <label>
              Temporary password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={{ display: "block", width: "100%" }} />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)} style={{ display: "block", width: "100%" }}>
                <option value="EMPLOYEE">Employee</option>
                {creatableRoles.includes("TEAM_LEAD") && <option value="TEAM_LEAD">Team lead</option>}
                {creatableRoles.includes("MANAGER") && <option value="MANAGER">Manager</option>}
                {creatableRoles.includes("ORG_ADMIN") && <option value="ORG_ADMIN">Org admin</option>}
              </select>
            </label>
            <label>
              Team (optional)
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ display: "block", width: "100%" }}>
                <option value="">No team</option>
                {teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </label>
            <label>
              Manager (optional)
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} style={{ display: "block", width: "100%" }}>
                <option value="">No manager</option>
                {managerCandidates.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </label>
            <button type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add employee"}</button>
          </form>
        </section>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setEditing(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2>Edit {editing.name}</h2>
            <form onSubmit={(e) => void handleEditSubmit(e)} style={{ display: "grid", gap: 12 }}>
              <label>Name<input value={editName} onChange={(e) => setEditName(e.target.value)} required style={{ display: "block", width: "100%" }} /></label>
              <label>Phone<input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
              <label>Team<select value={editTeamId} onChange={(e) => setEditTeamId(e.target.value)} style={{ display: "block", width: "100%" }}>
                <option value="">No team</option>{teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select></label>
              <label>Manager<select value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)} style={{ display: "block", width: "100%" }}>
                <option value="">No manager</option>{managerCandidates.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select></label>
              <fieldset style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
                <legend>Emergency contact</legend>
                <label>Name<input value={editEmergencyName} onChange={(e) => setEditEmergencyName(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
                <label>Relationship<input value={editEmergencyRelationship} onChange={(e) => setEditEmergencyRelationship(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
                <label>Phone<input value={editEmergencyPhone} onChange={(e) => setEditEmergencyPhone(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
                <label>Email<input type="email" value={editEmergencyEmail} onChange={(e) => setEditEmergencyEmail(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
              </fieldset>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={editSubmitting}>{editSubmitting ? "Saving..." : "Save changes"}</button>
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
