"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeResponse, TimesheetResponse } from "@ewm/shared-types";
import {
  clearSession,
  getAccessToken,
  getSessionUser,
  type SessionUser,
} from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { Nav } from "../../lib/nav";

// Phase 9 — Timesheets page. One page, role-conditional actions (same pattern
// as Employees/Schedule): any org member creates and submits their own weekly
// timesheet; managers (ORG_ADMIN/MANAGER/TEAM_LEAD) approve/reject and issue
// corrections. An APPROVED timesheet is immutable — "Correct" creates a new
// DRAFT version rather than editing in place (the critical Phase 9 rule).

const MANAGER_ROLES = ["ORG_ADMIN", "MANAGER", "TEAM_LEAD"];

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "#757575",
  SUBMITTED: "#ed6c02",
  APPROVED: "#2e7d32",
  REJECTED: "#d32f2f",
};

function startOfWeekMonday(base: Date): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function fmtDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function TimesheetsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [timesheets, setTimesheets] = useState<TimesheetResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [weekOffset, setWeekOffset] = useState(0);
  const [forEmployeeId, setForEmployeeId] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const mondayUtc = useMemo(() => {
    const base = startOfWeekMonday(new Date());
    base.setUTCDate(base.getUTCDate() + weekOffset * 7);
    return base;
  }, [weekOffset]);
  const weekStart = mondayUtc.toISOString();
  const weekEnd = new Date(mondayUtc.getTime() + 7 * 24 * 3600 * 1000 - 1).toISOString();

  const canManage = user != null && MANAGER_ROLES.includes(user.role);
  const myEmployeeId = employees.find((e) => e.userId === user?.sub)?.id ?? null;

  const load = useCallback(async () => {
    const [ts, emps] = await Promise.all([
      apiFetch<TimesheetResponse[]>("/timesheets"),
      apiFetch<EmployeeResponse[]>("/employees"),
    ]);
    setTimesheets(ts);
    setEmployees(emps);
  }, []);

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
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load]);

  function handleLogout() {
    clearSession();
    void router.push("/login");
  }

  async function run<T>(action: () => Promise<T>, okMessage: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      await load();
      setNotice(okMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const createForWeek = () =>
    run(
      () =>
        apiFetch("/timesheets", {
          method: "POST",
          body: JSON.stringify({
            periodStart: weekStart,
            ...(canManage && forEmployeeId ? { employeeId: forEmployeeId } : {}),
          }),
        }),
      "Timesheet created (DRAFT).",
    );

  const submit = (id: string) =>
    run(() => apiFetch(`/timesheets/${id}/submit`, { method: "POST" }), "Submitted for approval.");

  const approve = (id: string) =>
    run(() => apiFetch(`/timesheets/${id}/approve`, { method: "POST" }), "Approved.");

  async function reject(id: string) {
    await run(
      () =>
        apiFetch(`/timesheets/${id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason: rejectReason }),
        }),
      "Rejected.",
    );
    setRejectId(null);
    setRejectReason("");
  }

  const correct = (id: string) =>
    run(
      () => apiFetch(`/timesheets/${id}/correct`, { method: "POST" }),
      "Correction created as a new DRAFT version.",
    );

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <Nav user={user} onLogout={handleLogout} />
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <Nav user={user} onLogout={handleLogout} />
      <h1>Timesheets</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {notice && <p style={{ color: "green" }}>{notice}</p>}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Create weekly timesheet</h2>
        <p>Week starting {fmtDay(weekStart)}. Completed time entries will be aggregated.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setWeekOffset((value) => value - 1)}>Previous week</button>
          <button type="button" onClick={() => setWeekOffset(0)}>This week</button>
          <button type="button" onClick={() => setWeekOffset((value) => value + 1)}>Next week</button>
          {canManage && (
            <select value={forEmployeeId} onChange={(event) => setForEmployeeId(event.target.value)}>
              <option value="">For myself</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          )}
          <button type="button" disabled={busy} onClick={() => void createForWeek()}>Create draft</button>
        </div>
      </section>
      <section>
        <h2>Timesheet history</h2>
        {timesheets.length === 0 ? <p>No timesheets yet.</p> : (
          <div style={{ display: "grid", gap: 12 }}>
            {timesheets.map((timesheet) => (
              <article key={timesheet.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>{timesheet.employeeName} · week of {fmtDay(timesheet.periodStart)}</strong>
                  <span>{timesheet.status} · {fmtMinutes(timesheet.totalMinutes)} · v{timesheet.version}</span>
                </div>
                {timesheet.rejectionReason && <p>Reason: {timesheet.rejectionReason}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {timesheet.status === "DRAFT" && timesheet.employeeId === myEmployeeId && <button type="button" disabled={busy} onClick={() => void submit(timesheet.id)}>Submit</button>}
                  {canManage && timesheet.status === "SUBMITTED" && <button type="button" disabled={busy} onClick={() => void approve(timesheet.id)}>Approve</button>}
                  {canManage && timesheet.status === "SUBMITTED" && <button type="button" disabled={busy} onClick={() => { setRejectId(timesheet.id); setRejectReason(""); }}>Reject</button>}
                  {canManage && timesheet.status === "APPROVED" && <button type="button" disabled={busy} onClick={() => void correct(timesheet.id)}>Create correction</button>}
                </div>
                {rejectId === timesheet.id && (
                  <div style={{ marginTop: 12 }}>
                    <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Rejection reason" />
                    <button type="button" disabled={!rejectReason.trim() || busy} onClick={() => void reject(timesheet.id)}>Confirm rejection</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
