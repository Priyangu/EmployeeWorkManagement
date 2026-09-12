"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceResponse } from "@ewm/shared-types";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { Nav } from "../../lib/nav";

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [records, setRecords] = useState<AttendanceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState("0");

  const load = useCallback(async () => {
    setRecords(await apiFetch<AttendanceResponse[]>("/attendance"));
  }, []);

  useEffect(() => {
    const session = getSessionUser();
    if (!session || !getAccessToken()) { void router.replace("/login"); return; }
    setUser(session);
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load attendance")).finally(() => setLoading(false));
  }, [load, router]);

  const logout = () => { clearSession(); void router.push("/login"); };
  const active = records.find((record) => !record.clockOut);

  async function action(path: string, body?: object) {
    setError(null); setNotice(null); setBusy(true);
    try { await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) }); await load(); setNotice(path.includes("clock-in") ? "Clocked in." : "Clocked out."); }
    catch (err) { setError(err instanceof Error ? err.message : "Attendance action failed"); }
    finally { setBusy(false); }
  }

  if (!user || loading) return <main style={{ padding: 24 }}><Nav user={user} onLogout={logout} /><p>Loading...</p></main>;
  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <Nav user={user} onLogout={logout} />
      <h1>Attendance</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {notice && <p style={{ color: "green" }}>{notice}</p>}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Today</h2>
        {active ? <><p>Clocked in at {new Date(active.clockIn).toLocaleString()}.</p><label>Break minutes <input type="number" min="0" max="1440" value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)} /></label><button type="button" disabled={busy} onClick={() => void action("/attendance/clock-out", { breakMinutes: Number(breakMinutes) })}>Clock out</button></> : <><p>Not currently clocked in.</p><button type="button" disabled={busy} onClick={() => void action("/attendance/clock-in")}>Clock in</button></>}
      </section>
      <h2>Attendance history</h2>
      {records.length === 0 ? <p>No attendance records yet.</p> : <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}><th>Clock in</th><th>Clock out</th><th>Break</th><th>Flags</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} style={{ borderBottom: "1px solid #eee" }}><td>{new Date(record.clockIn).toLocaleString()}</td><td>{record.clockOut ? new Date(record.clockOut).toLocaleString() : "Active"}</td><td>{record.breakMinutes} min</td><td>{record.isLate ? "Late " : ""}{record.isEarlyDeparture ? "Early departure" : ""}</td></tr>)}</tbody></table>}
    </main>
  );
}
