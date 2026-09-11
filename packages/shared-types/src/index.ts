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

// ── Phase 5: Projects ────────────────────────────────────────────────────
export const ProjectStatus = {
  PLANNED: "PLANNED",
  ACTIVE: "ACTIVE",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export interface ProjectResponse {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  customer: string | null;
  startDate: string | null; // ISO-8601 date
  endDate: string | null; // ISO-8601 date
  status: ProjectStatus;
  budgetHours: number | null;
  budgetAmount: string | null; // Decimal serialised as string
  projectManagerId: string | null;
  projectManagerName: string | null;
  taskCount: number;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  customer?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  status?: ProjectStatus;
  budgetHours?: number;
  budgetAmount?: number;
  projectManagerId?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  customer?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: ProjectStatus;
  budgetHours?: number | null;
  budgetAmount?: number | null;
  projectManagerId?: string | null;
}

// ── Phase 6: Tasks ───────────────────────────────────────────────────────
export const TaskStatus = {
  NOT_STARTED: "NOT_STARTED",
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  BLOCKED: "BLOCKED",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export interface TaskResponse {
  id: string;
  organisationId: string;
  projectId: string;
  projectName: string;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedMinutes: number | null;
  dueDate: string | null; // ISO-8601
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface TaskCategoryResponse {
  id: string;
  organisationId: string;
  name: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface TaskCommentResponse {
  id: string;
  taskId: string;
  userId: string;
  userEmail: string;
  body: string;
  createdAt: string; // ISO-8601
}

export interface TaskAttachmentResponse {
  id: string;
  taskId: string;
  storageKey: string;
  fileName: string;
  mimeType: string | null;
  uploadedById: string;
  createdAt: string; // ISO-8601
}

export interface CreateTaskCategoryRequest {
  name: string;
}

export interface CreateTaskRequest {
  projectId: string;
  categoryId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  estimatedMinutes?: number;
  dueDate?: string; // ISO-8601
  assigneeId?: string;
}

export interface UpdateTaskRequest {
  categoryId?: string | null;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  estimatedMinutes?: number | null;
  dueDate?: string | null;
}

export interface AssignTaskRequest {
  employeeId: string;
}

export interface CreateTaskCommentRequest {
  body: string;
}

export interface CreateTaskAttachmentRequest {
  storageKey: string;
  fileName: string;
  mimeType?: string;
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
