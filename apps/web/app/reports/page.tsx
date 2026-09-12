"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardProjectPerformanceResponse, ProjectResponse } from "@ewm/shared-types";
import { apiFetch } from "../../lib/api";
import { clearSession, getAccessToken, getSessionUser, type SessionUser } from "../../lib/auth";
import { Nav } from "../../lib/nav";

export default function ReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [report, setReport] = useState<DashboardProjectPerformanceResponse | null>(null);
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSessionUser();
    if (!session || !getAccessToken()) { void router.replace("/login"); return; }
    setUser(session);
    void apiFetch<ProjectResponse[]>("/projects").then(setProjects).catch((err) => setError(err instanceof Error ? err.message : "Failed to load projects")).finally(() => setLoading(false));
  }, [router]);

  const logout = () => { clearSession(); void router.push("/login"); };
  function params(format?: string) {
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", projectId);
    if (from) query.set("from", `${from}T00:00:00.000Z`);
    if (to) query.set("to", `${to}T23:59:59.999Z`);
    if (format) query.set("format", format);
    return query.toString();
  }
  async function runReport() {
    setError(null);
    try { setReport(await apiFetch<DashboardProjectPerformanceResponse>(`/reports/project?${params()}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load report"); }
  }
  async function downloadCsv() {
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/reports/project?${params("csv")}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
      if (!response.ok) throw new Error(`Report download failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "project-report.csv"; link.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to download report"); }
  }

  if (!user || loading) return <main style={{ padding: 24 }}><Nav user={user} onLogout={logout} /><p>Loading reports...</p></main>;
  return <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}><Nav user={user} onLogout={logout} /><h1>Reports</h1><p>Compare planned and actual project effort over a reporting period.</p>{error && <p style={{ color: "crimson" }}>{error}</p>}<section style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", border: "1px solid #ddd", borderRadius: 8, padding: 16 }}><label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="button" onClick={() => void runReport()}>Run report</button><button type="button" onClick={() => void downloadCsv()}>Download CSV</button></section>{report && <section><h2>Project performance</h2><table cellPadding={10} style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}><th>Project</th><th>Planned</th><th>Actual</th><th>Variance</th><th>Completion</th></tr></thead><tbody>{report.projects.map((project) => <tr key={project.projectId} style={{ borderBottom: "1px solid #eee" }}><td>{project.projectName}</td><td>{project.plannedHours}h</td><td>{project.actualHours}h</td><td>{project.varianceHours}h</td><td>{project.completionPercent}%</td></tr>)}</tbody></table></section>}</main>;
}
