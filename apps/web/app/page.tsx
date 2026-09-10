"use client";

import { useEffect, useState } from "react";
import type { HealthCheckResponse } from "@ewm/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function HomePage() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError("Could not reach the API. Is it running?"));
  }, []);

  return (
    <main style={{ padding: 40, maxWidth: 640 }}>
      <h1>Employee Work Management — Web</h1>
      <p>Phase 1 scaffold. This page confirms the web app can reach the API.</p>
      <p>
        <a href="/login">Sign in</a> or{" "}
        <a href="/dashboard">go to dashboard</a>.
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {health && (
        <pre style={{ background: "#f4f4f5", padding: 16, borderRadius: 8 }}>
          {JSON.stringify(health, null, 2)}
        </pre>
      )}
      {!health && !error && <p>Checking API connectivity…</p>}
    </main>
  );
}
