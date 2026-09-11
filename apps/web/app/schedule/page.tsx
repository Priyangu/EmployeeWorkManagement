"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  EmployeeResponse,
  TaskResponse,
  TaskScheduleResponse,
} from "@ewm/shared-types";
import {
  clearSession,
  getAccessToken,
  getSessionUser,
  type SessionUser,
} from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { Nav } from "../../lib/nav";

// Phase 7 — Schedule page: week view of TaskSchedule blocks.
//
// Plain table grouped by employee (no calendar dependency): rows are
// employees, columns are the 7 days of the selected week. Each block shows
// hours + task title, flagged red when `overlaps` is true (the API warns on
// overlaps rather than rejecting). Managers reschedule via a per-block
// "Move" form; all writes go through POST/PATCH/DELETE /schedule with UTC
// ISO-8601 instants.

type DayColumn = { key: string; label: string; date: Date };

function startOfWeekMonday(base: Date): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function toDayColumns(mondayUtc: Date): DayColumn[] {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return names.map((label, i) => {
    const date = new Date(mondayUtc.getTime() + i * 24 * 3600 * 1000);
    return {
      key: date.toISOString().slice(0, 10),
      label: `${label} ${date.getUTCDate()}/${date.getUTCMonth() + 1}`,
      date,
    };
  });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtHours(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function toLocalInputValue(isoUtc: string): string {
  const d = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SchedulePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [schedules, setSchedules] = useState<TaskScheduleResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [weekOffset, setWeekOffset] = useState(0);
  const mondayUtc = useMemo(() => {
    const base = startOfWeekMonday(new Date());
    base.setUTCDate(base.getUTCDate() + weekOffset * 7);
    return base;
  }, [weekOffset]);
  const days = useMemo(() => toDayColumns(mondayUtc), [mondayUtc]);
  const weekFrom = mondayUtc.toISOString();
  const weekTo = new Date(mondayUtc.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  const [taskId, setTaskId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moveStart, setMoveStart] = useState("");
  const [moveEnd, setMoveEnd] = useState("");
  const [moving, setMoving] = useState(false);

  const canManage =
    user?.role === "ORG_ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD";

  async function loadWeek(from: string, to: string) {
    const list = await apiFetch<TaskScheduleResponse[]>(
      `/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    setSchedules(list);
  }

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
        const [empList, taskList] = await Promise.all([
          apiFetch<EmployeeResponse[]>("/employees"),
          apiFetch<TaskResponse[]>("/tasks"),
        ]);
        if (cancelled) return;
        setEmployees(empList);
        setTasks(taskList);
        await loadWeek(weekFrom, weekTo);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function handleLogout() {
    clearSession();
    void router.push("/login");
  }

  async function changeWeek(offset: number) {
    const next = weekOffset + offset;
    setWeekOffset(next);
    const base = startOfWeekMonday(new Date());
    base.setUTCDate(base.getUTCDate() + next * 7);
    const from = base.toISOString();
    const to = new Date(base.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    setError(null);
    try {
      await loadWeek(from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load week");
    }
  }

  function byDay(empId: string, dayKey: string): TaskScheduleResponse[] {
    return schedules
      .filter((s) => s.employeeId === empId && s.scheduledStart.slice(0, 10) === dayKey)
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!taskId || !employeeId || !startLocal || !endLocal) {
      setError("Pick a task, an employee, and both start and end times.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<TaskScheduleResponse>("/schedule", {
        method: "POST",
        body: JSON.stringify({
          taskId,
          employeeId,
          scheduledStart: new Date(startLocal).toISOString(),
          scheduledEnd: new Date(endLocal).toISOString(),
        }),
      });
      await loadWeek(weekFrom, weekTo);
      setNotice(created.overlaps ? "Scheduled with overlap warning(s)." : "Scheduled.");
      setTaskId("");
      setEmployeeId("");
      setStartLocal("");
      setEndLocal("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schedule failed");
    } finally {
      setSubmitting(false);
    }
  }

  function openMove(s: TaskScheduleResponse) {
    setMoveTarget(s.id);
    setMoveStart(toLocalInputValue(s.scheduledStart));
    setMoveEnd(toLocalInputValue(s.scheduledEnd));
  }

  async function handleMove(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setMoving(true);
    try {
      const updated = await apiFetch<TaskScheduleResponse>(`/schedule/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledStart: new Date(moveStart).toISOString(),
          scheduledEnd: new Date(moveEnd).toISOString(),
        }),
      });
      await loadWeek(weekFrom, weekTo);
      setMoveTarget(null);
      setNotice(updated.overlaps ? "Moved with overlap warning(s)." : "Moved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setMoving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setNotice(null);
    try {
      await apiFetch<void>(`/schedule/${id}`, { method: "DELETE" });
      await loadWeek(weekFrom, weekTo);
      setNotice("Removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) return <p>Loading schedule…</p>;

  const overlapCount = schedules.filter((s) => s.overlaps).length;

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <Nav user={user} onLogout={handleLogout} />
      <h1>Schedule</h1>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
      {notice && <p style={{ color: "green" }}>{notice}</p>}

      <section style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" onClick={() => void changeWeek(-1)}>
          Prev week
        </button>
        <strong>
          Week of {days[0].key} to {days[6].key}
        </strong>
        <button type="button" onClick={() => void changeWeek(1)}>
          Next week
        </button>
        <span style={{ color: overlapCount > 0 ? "crimson" : "#666" }}>
          {schedules.length} block(s)
          {overlapCount > 0 ? ` - ${overlapCount} overlapping` : ""}
        </span>
      </section>

      <section>
        <h2>Week view (UTC)</h2>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Employee</th>
                {days.map((d) => (
                  <th key={d.key} style={{ minWidth: 150, textAlign: "left" }}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.name}</strong></td>
                  {days.map((d) => (
                    <td key={d.key} style={{ verticalAlign: "top" }}>
                      {byDay(e.id, d.key).map((s) => (
                        <ScheduleBlock
                          key={s.id}
                          s={s}
                          canManage={canManage}
                          moveTarget={moveTarget}
                          moveStart={moveStart}
                          moveEnd={moveEnd}
                          moving={moving}
                          onOpenMove={openMove}
                          onDelete={() => void handleDelete(s.id)}
                          onMoveStart={setMoveStart}
                          onMoveEnd={setMoveEnd}
                          onCancelMove={() => setMoveTarget(null)}
                          onSaveMove={(ev) => void handleMove(ev, s.id)}
                        />
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {canManage && (
        <section style={{ marginTop: 24 }}>
          <h2>Schedule work</h2>
          <form
            onSubmit={(e) => void handleCreate(e)}
            style={{ display: "grid", gap: 12, maxWidth: 480 }}
          >
            <label>
              Task{" "}
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                required
              >
                <option value="">Select task…</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Employee{" "}
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start (local time){" "}
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                required
              />
            </label>
            <label>
              End (local time){" "}
              <input
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Scheduling…" : "Schedule"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

function ScheduleBlock(props: {
  s: TaskScheduleResponse;
  canManage: boolean;
  moveTarget: string | null;
  moveStart: string;
  moveEnd: string;
  moving: boolean;
  onOpenMove: (s: TaskScheduleResponse) => void;
  onDelete: () => void;
  onMoveStart: (v: string) => void;
  onMoveEnd: (v: string) => void;
  onCancelMove: () => void;
  onSaveMove: (ev: FormEvent<HTMLFormElement>) => void;
}) {
  const { s } = props;
  const isMoving = props.moveTarget === s.id;
  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderLeft: s.overlaps ? "4px solid crimson" : "4px solid #2e7d32",
        padding: 6,
        marginBottom: 6,
      }}
    >
      <div>
        {fmtTime(s.scheduledStart)}-{fmtTime(s.scheduledEnd)} ({fmtHours(s.scheduledStart, s.scheduledEnd)})
      </div>
      <div>{s.taskTitle}</div>
      {s.overlaps && <div style={{ color: "crimson" }}>Overlaps {s.conflictIds.length} block(s)</div>}
      {props.canManage && !isMoving && (
        <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
          <button type="button" onClick={() => props.onOpenMove(s)}>Move</button>
          <button type="button" onClick={props.onDelete}>Remove</button>
        </div>
      )}
      {props.canManage && isMoving && (
        <form onSubmit={props.onSaveMove} style={{ marginTop: 6, display: "grid", gap: 6 }}>
          <label>
            Start{" "}
            <input
              type="datetime-local"
              value={props.moveStart}
              onChange={(e) => props.onMoveStart(e.target.value)}
              required
            />
          </label>
          <label>
            End{" "}
            <input
              type="datetime-local"
              value={props.moveEnd}
              onChange={(e) => props.onMoveEnd(e.target.value)}
              required
            />
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" disabled={props.moving}>
              {props.moving ? "Moving…" : "Save"}
            </button>
            <button type="button" onClick={props.onCancelMove}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
