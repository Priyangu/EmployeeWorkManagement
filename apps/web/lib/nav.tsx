"use client";

import type { SessionUser } from "./auth";

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string; roles: string[] }> = [
  { href: "/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN", "ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/employees", label: "People", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/teams", label: "Teams", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD"] },
  { href: "/schedule", label: "Schedule", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/tasks", label: "Tasks", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/reports", label: "Reports", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD"] },
  { href: "/notifications", label: "Notifications", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/time-tracking", label: "Time Tracking", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/timesheets", label: "Timesheets", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/attendance", label: "Attendance", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
  { href: "/leave", label: "Leave", roles: ["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
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
    <header className="app-nav">
      <strong>EWM</strong>
      <span style={{ flex: 1 }} />
      {NAV_ITEMS.filter((item) => user && item.roles.includes(user.role)).map((item) => (
        <a key={item.href} href={item.href}>
          {item.label}
        </a>
      ))}
      {user && (
        <span className="nav-user">{user.email} ({user.role})</span>
      )}
      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}