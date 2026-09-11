"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getSessionUser, type SessionUser } from "../../lib/auth";
import { Nav } from "../../lib/nav";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser) {
      void router.replace("/login");
      return;
    }
    setUser(sessionUser);
  }, [router]);

  function handleLogout() {
    clearSession();
    void router.push("/login");
  }

  return (
    <main style={{ padding: 40, maxWidth: 720 }}>
      <Nav user={user} onLogout={handleLogout} />
      <h1>Dashboard</h1>
      {!user ? (
        <p>Loading…</p>
      ) : (
        <>
          <p>
            Welcome, <strong>{user.email}</strong>. Signed in as{" "}
            <code>{user.role}</code>
            {user.organisationId ? (
              <> (org <code>{user.organisationId}</code>)</>
            ) : null}
            .
          </p>
          <p style={{ color: "#666", fontSize: 14 }}>
            Real dashboard widgets arrive in Phase 10 — for now, manage your
            team from the pages below.
          </p>
          <section>
            <h2>Team management</h2>
            <ul>
              <li>
                <a href="/employees">Employees</a> — list, add, disable and
                re-enable employees (Phase 4).
              </li>
              <li>
                <a href="/teams">Teams</a> — create teams and assign managers
                (Phase 4).
              </li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}