"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LeaveRequestResponse } from "@ewm/shared-types";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { Nav } from "../../lib/nav";

const MANAGER_ROLES = ["ORG_ADMIN", "MANAGER", "TEAM_LEAD"];

export default function LeavePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [requests, setRequests] = useState<LeaveRequestResponse[]>([]);
  const [type, setType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => setRequests(await apiFetch<LeaveRequestResponse[]>("/leave-requests")), []);
  useEffect(() => {
    const session = getSessionUser();
    if (!session || !getAccessToken()) { void router.replace("/login"); return; }
    setUser(session);
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load leave")).finally(() => setLoading(false));
  }, [load, router]);

  const logout = () => { clearSession(); void router.push("/login"); };
  const canManage = user != null && MANAGER_ROLES.includes(user.role);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setNotice(null); setBusy(true);
    try { await apiFetch("/leave-requests", { method: "POST", body: JSON.stringify({ type, startDate: `${startDate}T00:00:00.000Z`, endDate: `${endDate}T23:59:59.999Z`, ...(reason.trim() ? { reason: reason.trim() } : {}) }) }); await load(); setReason(""); setNotice("Leave request submitted."); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to submit leave"); }
    finally { setBusy(false); }
  }
  async function decide(id: string, decision: "approve" | "reject") {
    setError(null); setNotice(null); setBusy(true);
    try { await apiFetch(`/leave-requests/${id}/${decision}`, { method: "POST", body: decision === "reject" ? JSON.stringify({ reason: rejectReason[id] ?? "" }) : "{}" }); await load(); setNotice(`Leave request ${decision}d.`); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to update leave"); }
    finally { setBusy(false); }
  }

  if (!user || loading) return <main style={{ padding: 24 }}><Nav user={user} onLogout={logout} /><p>Loading...</p></main>;
  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <Nav user={user} onLogout={logout} />
      <h1>Leave</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {notice && <p style={{ color: "green" }}>{notice}</p>}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 }}><h2 style={{ marginTop: 0 }}>Request leave</h2><form onSubmit={(event) => void submit(event)} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="ANNUAL">Annual</option><option value="SICK">Sick</option><option value="OTHER">Other</option></select></label><label>Start<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End<input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="submit" disabled={busy}>Submit request</button></form></section>
      <h2>Requests</h2>
      {requests.length === 0 ? <p>No leave requests yet.</p> : <div style={{ display: "grid", gap: 12 }}>{requests.map((request) => <article key={request.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}><strong>{request.employeeName} · {request.type} · {request.status}</strong><p>{new Date(request.startDate).toLocaleDateString()} to {new Date(request.endDate).toLocaleDateString()}</p>{request.reason && <p>{request.reason}</p>}{canManage && request.status === "PENDING" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" disabled={busy} onClick={() => void decide(request.id, "approve")}>Approve</button><input placeholder="Rejection reason" value={rejectReason[request.id] ?? ""} onChange={(event) => setRejectReason((current) => ({ ...current, [request.id]: event.target.value }))} /><button type="button" disabled={busy || !(rejectReason[request.id] ?? "").trim()} onClick={() => void decide(request.id, "reject")}>Reject</button></div>}</article>)}</div>}
    </main>
  );
}
