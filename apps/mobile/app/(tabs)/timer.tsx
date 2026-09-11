import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { TimeEntryResponse } from "@ewm/shared-types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

const getAccessToken = (): string | null => {
  return (global as any).__ewmAccessToken ?? null;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
    } catch { /* keep fallback */ }
    throw new Error(message);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
export default function TimerScreen() {
  const [activeEntry, setActiveEntry] = useState<TimeEntryResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadActiveEntry = useCallback(async () => {
    try {
      const data = await apiFetch<TimeEntryResponse | null>("/time-entries/active");
      setActiveEntry(data);
    } catch { setActiveEntry(null); }
  }, []);

  useEffect(() => { loadActiveEntry(); }, [loadActiveEntry]);

  useEffect(() => {
    if (!activeEntry || activeEntry.status === "COMPLETED") return;
    const startMs = new Date(activeEntry.startTime).getTime();
    const paused = activeEntry.pausedSeconds ?? 0;
    const tick = () => {
      const now = Date.now();
      setElapsed(Math.max(Math.floor((now - startMs) / 1000) - paused, 0));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const handleStart = async () => {
    setError(null); setNotice(null); setSubmitting(true);
    try {
      await apiFetch("/time-entries/start", { method: "POST", body: JSON.stringify({}) });
      await loadActiveEntry(); setNotice("Timer started");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to start timer"); }
    finally { setSubmitting(false); }
  };

  const handlePause = async () => {
    if (!activeEntry) return;
    setError(null); setNotice(null); setSubmitting(true);
    try { await apiFetch(`/time-entries/${activeEntry.id}/pause`, { method: "POST" }); await loadActiveEntry(); setNotice("Paused"); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to pause timer"); }
    finally { setSubmitting(false); }
  };

  const handleResume = async () => {
    if (!activeEntry) return;
    setError(null); setNotice(null); setSubmitting(true);
    try { await apiFetch(`/time-entries/${activeEntry.id}/resume`, { method: "POST" }); await loadActiveEntry(); setNotice("Resumed"); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to resume timer"); }
    finally { setSubmitting(false); }
  };

  const handleStop = async () => {
    if (!activeEntry) return;
    setError(null); setNotice(null); setSubmitting(true);
    try { await apiFetch(`/time-entries/${activeEntry.id}/stop`, { method: "POST", body: "{}" }); await loadActiveEntry(); setNotice("Stopped"); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to stop timer"); }
    finally { setSubmitting(false); }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Timer</Text>
      {error && (<View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>)}
      {notice && (<View style={styles.noticeBox}><Text style={styles.noticeText}>{notice}</Text></View>)}
      {activeEntry ? (
        <View style={styles.activeSection}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: activeEntry.status === "RUNNING" ? "#2e7d32" : "#ed6c02" }]}>
              <Text style={styles.statusText}>{activeEntry.status}</Text>
            </View>
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceText}>{activeEntry.source}</Text>
            </View>
          </View>
          <Text style={styles.elapsed}>{fmtDuration(elapsed)}</Text>
          {activeEntry.notes && <Text style={styles.notes}>{activeEntry.notes}</Text>}
          <View style={styles.controls}>
            {activeEntry.status === "RUNNING" && (
              <TouchableOpacity style={[styles.button, { backgroundColor: "#ed6c02" }]} onPress={handlePause} disabled={submitting}>
                <Text style={styles.buttonText}>Pause</Text>
              </TouchableOpacity>
            )}
            {activeEntry.status === "PAUSED" && (
              <TouchableOpacity style={[styles.button, { backgroundColor: "#2e7d32" }]} onPress={handleResume} disabled={submitting}>
                <Text style={styles.buttonText}>Resume</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.button, { backgroundColor: "#d32f2f" }]} onPress={handleStop} disabled={submitting}>
              <Text style={styles.buttonText}>Stop</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.idleSection}>
          <Text style={styles.idleText}>No active timer</Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: "#2e7d32" }]} onPress={handleStart} disabled={submitting}>
            <Text style={styles.buttonText}>Start Timer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 24 },
  errorBox: { backgroundColor: "#ffebee", borderWidth: 1, borderColor: "#ef5350", padding: 12, borderRadius: 4, marginBottom: 16, width: "100%" },
  errorText: { color: "#d32f2f" },
  noticeBox: { backgroundColor: "#e8f5e9", borderWidth: 1, borderColor: "#66bb6a", padding: 12, borderRadius: 4, marginBottom: 16, width: "100%" },
  noticeText: { color: "#2e7d32" },
  activeSection: { alignItems: "center", width: "100%" },
  statusRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  sourceBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: "#e3f2fd" },
  sourceText: { color: "#1976d2", fontSize: 12 },
  elapsed: { fontSize: 48, fontWeight: "700", marginBottom: 16 },
  notes: { fontSize: 14, color: "#666", fontStyle: "italic", marginBottom: 24, textAlign: "center" },
  controls: { flexDirection: "row", gap: 12, marginTop: 16 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  idleSection: { alignItems: "center" },
  idleText: { fontSize: 16, color: "#666", marginBottom: 24 },
});