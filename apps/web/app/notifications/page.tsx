"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationResponse } from "@ewm/shared-types";
import { apiFetch } from "../../lib/api";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { Nav } from "../../lib/nav";

const labels: Record<string, string> = {
  TASK_ASSIGNED: "Task assigned",
  TIMESHEET_APPROVED: "Timesheet approved",
  TIMESHEET_REJECTED: "Timesheet rejected",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await apiFetch<NotificationResponse[]>("/notifications")), []);
  useEffect(() => {
    const session = getSessionUser();
    if (!session || !getAccessToken()) { void router.replace("/login"); return; }
    setUser(session);
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load notifications")).finally(() => setLoading(false));
  }, [load, router]);

  const logout = () => { clearSession(); void router.push("/login"); };
  async function markRead(id: string) {
    try { await apiFetch(`/notifications/${id}/read`, { method: "POST" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to mark notification read"); }
  }

  if (!user || loading) return <main style={{ padding: 24 }}><Nav user={user} onLogout={logout} /><p>Loading notifications...</p></main>;
  return <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}><Nav user={user} onLogout={logout} /><h1>Notifications</h1><p>Recent updates about assignments and approvals.</p>{error && <p style={{ color: "crimson" }}>{error}</p>}{items.length === 0 ? <p>No notifications yet.</p> : <div style={{ display: "grid", gap: 10 }}>{items.map((item) => <article key={item.id} style={{ border: "1px solid #ddd", borderLeft: `5px solid ${item.isRead ? "#cfd8dc" : "#e8654f"}`, borderRadius: 8, padding: 16, background: item.isRead ? "#fafafa" : "#fff" }}><strong>{labels[item.type] ?? item.type}</strong><div style={{ color: "#666", fontSize: 14 }}>{new Date(item.createdAt).toLocaleString()}</div><p>{item.type === "TASK_ASSIGNED" ? `Task: ${String(item.payload.title ?? "New task")}` : `Timesheet ${String(item.payload.status ?? "updated").toLowerCase()}.`}</p>{!item.isRead && <button type="button" onClick={() => void markRead(item.id)}>Mark as read</button>}</article>)}</div>}</main>;
}
