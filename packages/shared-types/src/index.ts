// Shared types/enums used by api, web, and mobile.
// Keep this package free of framework-specific imports (no Nest, no React,
// no React Native) so it can be consumed from any of the three apps.

export interface HealthCheckResponse {
  status: "ok";
  timestamp: string;
  service: string;
}

// Core enums (added early since almost every later module depends on them).
// Extend this file as new modules land — do not duplicate these definitions
// in individual apps.

// NOTE: these are declared as const objects + type aliases rather than TS
// `enum`. The API dev server runs with Node's native TypeScript support
// (strip types only, no code transforms), which cannot load `enum`
// declarations. Plain const objects are runtime-valid either way and give
// the same `UserRole.X` / `OrganisationStatus.Y` usage.

export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_ADMIN: "ORG_ADMIN",
  MANAGER: "MANAGER",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const EmploymentStatus = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export type EmploymentStatus = (typeof EmploymentStatus)[keyof typeof EmploymentStatus];

// ── Phase 4: Employees & Teams ───────────────────────────────────────────
export interface WorkingHours {
  // Free-form per-day schedule, e.g. { mon: { start: "09:00", end: "17:00" } }.
  // Validated lightly on the API (must be an object); interpreted by the UI.
  [day: string]: unknown;
}

export interface EmployeeResponse {
  id: string;
  organisationId: string;
  userId: string | null;
  email: string | null;
  role: string | null;
  name: string;
  phone: string | null;
  teamId: string | null;
  teamName: string | null;
  managerId: string | null;
  managerName: string | null;
  timeZone: string;
  workingHours: WorkingHours | null;
  employmentStatus: EmploymentStatus;
  isActive: boolean | null; // linked User.isActive, null when no linked user
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface TeamResponse {
  id: string;
  organisationId: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  memberCount: number;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface CreateEmployeeRequest {
  // Mode A (create login + profile together): email + password (+ optional role).
  // Mode B (link to existing user): userId.
  // Exactly one mode is required — the API rejects both/neither.
  email?: string;
  password?: string;
  role?: UserRole;
  userId?: string;
  name: string;
  phone?: string;
  teamId?: string;
  managerId?: string;
  timeZone?: string;
  workingHours?: WorkingHours;
}

export interface UpdateEmployeeRequest {
  name?: string;
  phone?: string | null;
  teamId?: string | null;
  managerId?: string | null;
  timeZone?: string;
  workingHours?: WorkingHours | null;
}

export interface CreateTeamRequest {
  name: string;
  managerId?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  managerId?: string | null;
}

export const OrganisationStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export type OrganisationStatus = (typeof OrganisationStatus)[keyof typeof OrganisationStatus];

export interface OrganisationResponse {
  id: string;
  name: string;
  timeZone: string;
  country: string;
  status: OrganisationStatus;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// What POST /auth/login and POST /auth/refresh return. Shared with web/mobile
// so both frontends can implement the session flow against the same shapes.
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token TTL in seconds
}

export interface LoginRequest {
  email: string;
  password: string;
}
