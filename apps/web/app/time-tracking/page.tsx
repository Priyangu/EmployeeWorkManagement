"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimeEntryResponse } from "@ewm/shared-types";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { Nav } from "../../lib/nav";

function fmtDuration(sec: number | null): string {
  if (sec === null || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function TimeTrackingPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [entries, setEntries] = useState<TimeEntryResponse[]>([]);
  const [active, setActive] = useState<TimeEntryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");

  const loadAll = useCallback(async () => {
    const [list, activeEntry] = await Promise.all([
      apiFetch<TimeEntryResponse[]>("/time-entries"),
      apiFetch<TimeEntryResponse | null>("/time-entries/active").catch(() => null),
    ]);
    setEntries(list);
    setActive(activeEntry);
  }, []);

  useEffect(() => {
    if (!getAccessToken() || !getSessionUser()) { router.push("/login"); return; }
    setUser(getSessionUser());
    (async () => { setLoading(true); await loadAll(); setLoading(false); })();
  }, [router, loadAll]);

  const logout = () => { clearSession(); router.push("/login"); };

  const start = async () => {
    setError(null); setNotice(null); setBusy(true);
    try {
      const body: Record<string, string> = {};
      if (notes.trim()) body.notes = notes.trim();
      await apiFetch("/time-entries/start", { method: "POST", body: JSON.stringify(body) });
      setNotes(""); await loadAll(); setNotice("Timer started");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const pause = async (id: string) => {
    setError(null); setNotice(null); setBusy(true);
    try { await apiFetch(`/time-entries/${id}/pause`, { method: "POST" }); await loadAll(); setNotice("Paused"); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const resume = async (id: string) => {
    setError(null); setNotice(null); setBusy(true);
    try { await apiFetch(`/time-entries/${id}/resume`, { method: "POST" }); await loadAll(); setNotice("Resumed"); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const stop = async (id: string) => {
    setError(null); setNotice(null); setBusy(true);
    try { await apiFetch(`/time-entries/${id}/stop`, { method: "POST", body: "{}" }); await loadAll(); setNotice("Stopped"); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (loading) return <main style={{ padding: 24 }}><Nav user={user} onLogout={logout} /><p>Loading…</p></main>;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <Nav user={user} onLogout={logout} />
      <h1 style={{ marginBottom: 8 }}>Time Tracking</h1>
      {error && <div style={{ background: "#ffebee", padding: 12, borderRadius: 4, marginBottom: 16 }}>{error}</div>}
      {notice && <div style={{ background: "#e8f5e9", padding: 12, borderRadius: 4, marginBottom: 16 }}>{notice}</div>}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24, background: "#fafafa" }}>
        <h2 style={{ marginTop: 0 }}>Timer</h2>
        {active ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ padding: "4px 12px", borderRadius: 12, background: active.status === "RUNNING" ? "#2e7d32" : "#ed6c02", color: "#fff", fontWeight: 600 }}>{active.status}</span>
            </div>
            {active.notes && <p style={{ color: "#666", fontStyle: "italic" }}>{active.notes}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {active.status === "RUNNING" && <button onClick={() => pause(active.id)} disabled={busy} style={{ padding: "8px 16px", background: "#ed6c02", color: "#fff", border: "none", borderRadius: 4 }}>Pause</button>}
              {active.status === "PAUSED" && <button onClick={() => resume(active.id)} disabled={busy} style={{ padding: "8px 16px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4 }}>Resume</button>}
              <button onClick={() => stop(active.id)} disabled={busy} style={{ padding: "8px 16px", background: "#d32f2f", color: "#fff", border: "none", borderRadius: 4 }}>Stop</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: "#666" }}>No active timer.</p>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 14, color: "#666" }}>Notes</span>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What are you working on?" style={{ padding: 8, minWidth: 250 }} />
              </label>
              <button onClick={start} disabled={busy} style={{ padding: "8px 24px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4 }}>Start Timer</button>
            </div>
          </div>
        )}
      </section>
      <section>
        <h2>Time Entries</h2>
        {entries.length === 0 ? <p style={{ color: "#666" }}>No entries yet.</p> : (
          <div style={{ display: "grid", gap: 12 }}>
            {entries.map((en) => (
              <div key={en.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <span style={{ padding: "2px 8px", borderRadius: 10, background: en.status === "RUNNING" ? "#2e7d32" : en.status === "PAUSED" ? "#ed6c02" : "#1976d2", color: "#fff", fontSize: 12, fontWeight: 600 }}>{en.status}</span>
                    <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 10, background: "#e3f2fd", color: "#1976d2", fontSize: 12 }}>{en.source}</span>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 18 }}>{fmtDuration(en.durationSeconds)}</span>
                </div>
                <div style={{ color: "#333" }}>{new Date(en.startTime).toLocaleString()}{en.endTime && ` – ${new Date(en.endTime).toLocaleString()}`}</div>
                {en.taskTitle && <div style={{ color: "#666", fontSize: 14 }}>Task: {en.taskTitle}</div>}
                {en.notes && <p style={{ color: "#666", fontStyle: "italic" }}>{en.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}