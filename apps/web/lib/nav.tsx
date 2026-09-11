"use client";

import type { SessionUser } from "./auth";

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "Employees" },
  { href: "/teams", label: "Teams" },
  { href: "/schedule", label: "Schedule" },
  { href: "/time-tracking", label: "Time Tracking" },
];

// Shared top navigation for authenticated pages. Plain <a> links keep it
// consistent with the rest of the MVP; each page still enforces its own
// auth/role guards before rendering sensitive actions.
export function Nav({
  user,
  onLogout,
}: {
  user: SessionUser | null;
  onLogout: () => void;
}) {
  return (
    <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <strong>EWM</strong>
      <span style={{ flex: 1 }} />
      {NAV_ITEMS.map((item) => (
        <a key={item.href} href={item.href}>
          {item.label}
        </a>
      ))}
      {user && (
        <span style={{ color: "#666" }}>{user.email} ({user.role})</span>
      )}
      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}