"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthTokens } from "@ewm/shared-types";
import { storeSession } from "../../lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        let message = `Login failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.message) {
            message = Array.isArray(body.message)
              ? body.message.join(", ")
              : String(body.message);
          }
        } catch {
          // keep the fallback message
        }
        setError(message);
        return;
      }

      const tokens: AuthTokens = await res.json();
      storeSession(tokens);
      router.push("/dashboard");
    } catch {
      setError("Could not reach the API. Is it running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 360, margin: "0 auto" }}>
      <h1>Employee Work Management</h1>
      <p>Phase 3 — sign in to your organisation.</p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "grid", gap: 12, maxWidth: 320 }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
            autoComplete="current-password"
          />
        </label>

        {error && <p style={{ color: "crimson" }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 16px",
            cursor: submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ fontSize: 13, color: "#666", marginTop: 24 }}>
        Seeded test users (password{" "}
        <code>Password123!</code>):{" "}
        <code>admin@ewm.test</code>, <code>manager@ewm.test</code>,{" "}
        <code>employee@ewm.test</code>. Super admin:{" "}
        <code>superadmin@ewm.test</code>.
      </p>
    </main>
  );
}